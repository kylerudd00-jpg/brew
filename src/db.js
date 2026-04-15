/**
 * SQLite persistence layer via better-sqlite3.
 *
 * Responsibilities:
 *  - Cache brewery + beer data across server restarts (avoids redundant API calls)
 *  - Power the /trending endpoint from aggregated stored data
 *  - Log search analytics
 *  - Store ZIP → coords so Geocoding API is hit at most once per ZIP ever
 *
 * Fault-tolerant: if better-sqlite3 fails to load (e.g. native module issue on
 * serverless), all exports degrade to safe no-ops / empty results so the rest of
 * the app keeps working via the in-memory cache.
 */

const path = require('path');
const fs   = require('fs');

// ── Pure helpers (no DB dependency) ──────────────────────────────────────────

function makeBeerID(breweryId, beerName) {
  const raw = `${breweryId}:${beerName}`.toLowerCase().replace(/\s+/g, '-');
  let h = 0;
  for (const c of raw) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return `beer-${Math.abs(h).toString(16)}`;
}

function cleanBeerName(name) {
  return name
    .replace(/\s*\d+(\.\d+)?%\s*(abv)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Stubs — returned when SQLite is unavailable ───────────────────────────────

const STUBS = {
  db:                   null,
  // ZIP
  getZipCoords:         ()  => null,
  saveZipCoords:        ()  => {},
  // Breweries
  upsertBrewery:        ()  => {},
  upsertBreweries:      ()  => {},
  getBrewery:           ()  => null,
  getCachedBreweriesNear: () => [],
  // Beers
  upsertBeer:           (beer) => makeBeerID(beer.brewery_id || beer.breweryId, beer.name),
  upsertBeers:          ()  => {},
  getBeersByBrewery:    ()  => [],
  getTopBeers:          ()  => [],
  getBeer:              ()  => null,
  getSimilarBeers:      ()  => [],
  // Events
  upsertEvent:          ()  => {},
  upsertEvents:         ()  => {},
  getEventsByBrewery:   ()  => [],
  getUpcomingEvents:    ()  => [],
  // Favorites
  saveFavorite:         ()  => {},
  deleteFavorite:       ()  => false,
  getFavorites:         ()  => [],
  isFavorite:           ()  => false,
  clearFavorites:       ()  => 0,
  // Analytics
  logSearch:            ()  => {},
  getStats:             ()  => ({
    counts: { breweries: 0, beers: 0, events: 0, searches: 0 },
    weekly: null,
    topZips: [],
  }),
};

// ── Attempt SQLite initialization ─────────────────────────────────────────────

let _exports;

try {
  const Database = require('better-sqlite3');

  // On Vercel the project root is read-only — use /tmp instead
  const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..', 'data');
  const DB_PATH  = path.join(DATA_DIR, 'beer-intel.db');

  if (!process.env.VERCEL) fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // ── Schema ──────────────────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS zip_coords (
      zip       TEXT PRIMARY KEY,
      lat       REAL NOT NULL,
      lng       REAL NOT NULL,
      cached_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS breweries (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      address       TEXT,
      lat           REAL,
      lng           REAL,
      website       TEXT,
      place_id      TEXT,
      google_rating REAL,
      last_updated  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS beers (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      name_clean    TEXT,
      style         TEXT,
      style_category TEXT,
      abv           REAL,
      brewery_id    TEXT NOT NULL,
      rating        REAL,
      review_count  INTEGER,
      source        TEXT DEFAULT 'simulated',
      available     INTEGER DEFAULT 1,
      last_seen     INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (brewery_id) REFERENCES breweries(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      date         TEXT,
      url          TEXT,
      brewery_id   TEXT,
      brewery_name TEXT,
      source       TEXT,
      last_updated INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS searches (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      zip           TEXT NOT NULL,
      brewery_count INTEGER,
      beer_count    INTEGER,
      duration_ms   INTEGER,
      cache_hit     INTEGER DEFAULT 0,
      searched_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT    NOT NULL,
      beer_id     TEXT    NOT NULL,
      beer_name   TEXT    NOT NULL,
      brewery_id  TEXT,
      brewery_name TEXT,
      style       TEXT,
      rating      REAL,
      abv         REAL,
      saved_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(session_id, beer_id)
    );

    CREATE INDEX IF NOT EXISTS idx_beers_brewery  ON beers(brewery_id);
    CREATE INDEX IF NOT EXISTS idx_beers_style    ON beers(style_category);
    CREATE INDEX IF NOT EXISTS idx_beers_rating   ON beers(rating DESC);
    CREATE INDEX IF NOT EXISTS idx_events_brewery ON events(brewery_id);
    CREATE INDEX IF NOT EXISTS idx_searches_zip   ON searches(zip);
    CREATE INDEX IF NOT EXISTS idx_searches_at    ON searches(searched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_favs_session   ON favorites(session_id);
  `);

  // ── ZIP coords ───────────────────────────────────────────────────────────────

  const _getZip    = db.prepare('SELECT lat, lng FROM zip_coords WHERE zip = ?');
  const _upsertZip = db.prepare(`
    INSERT INTO zip_coords (zip, lat, lng) VALUES (@zip, @lat, @lng)
    ON CONFLICT(zip) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, cached_at = unixepoch()
  `);

  function getZipCoords(zip) { return _getZip.get(zip) || null; }
  function saveZipCoords(zip, lat, lng) { _upsertZip.run({ zip, lat, lng }); }

  // ── Breweries ────────────────────────────────────────────────────────────────

  const _upsertBrewery = db.prepare(`
    INSERT INTO breweries (id, name, address, lat, lng, website, place_id, google_rating, last_updated)
    VALUES (@id, @name, @address, @lat, @lng, @website, @place_id, @google_rating, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      name          = excluded.name,
      address       = excluded.address,
      lat           = excluded.lat,
      lng           = excluded.lng,
      website       = coalesce(excluded.website, breweries.website),
      google_rating = coalesce(excluded.google_rating, breweries.google_rating),
      last_updated  = unixepoch()
  `);

  const _getBrewery         = db.prepare('SELECT * FROM breweries WHERE id = ?');
  const _nearbyBreweries    = db.prepare(`
    SELECT * FROM breweries
    WHERE lat BETWEEN @latMin AND @latMax
      AND lng BETWEEN @lngMin AND @lngMax
      AND last_updated > unixepoch() - @maxAgeSec
  `);

  function upsertBrewery(b) {
    _upsertBrewery.run({
      id: b.id, name: b.name, address: b.address || null,
      lat: b.lat, lng: b.lng, website: b.website || null,
      place_id: b.placeId || b.id, google_rating: b.googleRating || null,
    });
  }

  function getBrewery(id) { return _getBrewery.get(id) || null; }

  function getCachedBreweriesNear(lat, lng, radiusMiles, maxAgeSec = 3600) {
    const deg = radiusMiles / 69;
    return _nearbyBreweries.all({
      latMin: lat - deg, latMax: lat + deg,
      lngMin: lng - deg, lngMax: lng + deg,
      maxAgeSec,
    });
  }

  const upsertBreweries = db.transaction((list) => { for (const b of list) upsertBrewery(b); });

  // ── Beers ────────────────────────────────────────────────────────────────────

  const _upsertBeer = db.prepare(`
    INSERT INTO beers (id, name, name_clean, style, style_category, abv, brewery_id,
                       rating, review_count, source, available, last_seen)
    VALUES (@id, @name, @name_clean, @style, @style_category, @abv, @brewery_id,
            @rating, @review_count, @source, 1, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      rating       = excluded.rating,
      review_count = excluded.review_count,
      available    = 1,
      last_seen    = unixepoch()
  `);

  const _getBeersByBrewery = db.prepare('SELECT * FROM beers WHERE brewery_id = ? ORDER BY rating DESC');
  const _topBeers          = db.prepare(`
    SELECT b.*, br.name AS brewery_name, br.address AS brewery_address,
           br.website AS brewery_website, br.lat, br.lng
    FROM beers b
    JOIN breweries br ON b.brewery_id = br.id
    WHERE b.available = 1
      AND (@style IS NULL OR b.style_category = @style)
      AND (@minRating IS NULL OR b.rating >= @minRating)
      AND b.last_seen > unixepoch() - 86400 * 7
    ORDER BY b.rating DESC, b.review_count DESC
    LIMIT @limit
  `);
  const _getBeerById = db.prepare(`
    SELECT b.*, br.name AS brewery_name, br.address AS brewery_address,
           br.website AS brewery_website, br.lat, br.lng
    FROM beers b JOIN breweries br ON b.brewery_id = br.id WHERE b.id = ?
  `);
  const _similarBeers = db.prepare(`
    SELECT b.*, br.name AS brewery_name, br.address AS brewery_address,
           br.website AS brewery_website
    FROM beers b JOIN breweries br ON b.brewery_id = br.id
    WHERE b.style_category = @style AND b.id != @id
      AND b.available = 1 AND b.last_seen > unixepoch() - 86400 * 14
    ORDER BY b.rating DESC LIMIT @limit
  `);

  function upsertBeer(beer) {
    const id = makeBeerID(beer.brewery_id || beer.breweryId, beer.name);
    _upsertBeer.run({
      id, name: beer.name,
      name_clean:     beer.name_clean || cleanBeerName(beer.name),
      style:          beer.style || null,
      style_category: beer.style_category || null,
      abv:            beer.abv || null,
      brewery_id:     beer.brewery_id || beer.breweryId,
      rating:         beer.rating || null,
      review_count:   beer.reviewCount || beer.review_count || 0,
      source:         beer.source || 'simulated',
    });
    return id;
  }

  const upsertBeers        = db.transaction((list) => { for (const b of list) upsertBeer(b); });
  function getBeersByBrewery(id) { return _getBeersByBrewery.all(id); }
  function getTopBeers({ style = null, minRating = null, limit = 20 } = {}) {
    return _topBeers.all({ style, minRating, limit });
  }
  function getBeer(id) { return _getBeerById.get(id) || null; }
  function getSimilarBeers(id, style, limit = 5) { return _similarBeers.all({ id, style, limit }); }

  // ── Events ───────────────────────────────────────────────────────────────────

  const _upsertEvent = db.prepare(`
    INSERT INTO events (id, name, date, url, brewery_id, brewery_name, source, last_updated)
    VALUES (@id, @name, @date, @url, @brewery_id, @brewery_name, @source, unixepoch())
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, date = excluded.date, last_updated = unixepoch()
  `);
  const _getEventsByBrewery = db.prepare(
    `SELECT * FROM events WHERE brewery_id = ? AND (date IS NULL OR date >= date('now')) ORDER BY date ASC LIMIT 10`
  );
  const _upcomingEvents = db.prepare(
    `SELECT * FROM events WHERE (date IS NULL OR date >= date('now'))
     AND last_updated > unixepoch() - 86400 ORDER BY date ASC LIMIT @limit`
  );

  function upsertEvent(ev) {
    _upsertEvent.run({
      id: ev.id, name: ev.name, date: ev.date || null, url: ev.url || null,
      brewery_id: ev.breweryId || ev.brewery_id || null,
      brewery_name: ev.breweryName || ev.brewery_name || null,
      source: ev.source || 'scraped',
    });
  }
  const upsertEvents          = db.transaction((list) => { for (const ev of list) upsertEvent(ev); });
  function getEventsByBrewery(id) { return _getEventsByBrewery.all(id); }
  function getUpcomingEvents(limit = 20) { return _upcomingEvents.all({ limit }); }

  // ── Favorites ─────────────────────────────────────────────────────────────────

  const _saveFavorite   = db.prepare(`
    INSERT OR IGNORE INTO favorites
      (session_id, beer_id, beer_name, brewery_id, brewery_name, style, rating, abv)
    VALUES (@session_id, @beer_id, @beer_name, @brewery_id, @brewery_name, @style, @rating, @abv)
  `);
  const _deleteFavorite = db.prepare('DELETE FROM favorites WHERE session_id = ? AND beer_id = ?');
  const _getFavorites   = db.prepare('SELECT * FROM favorites WHERE session_id = ? ORDER BY saved_at DESC');
  const _isFavorite     = db.prepare('SELECT 1 FROM favorites WHERE session_id = ? AND beer_id = ?');
  const _clearFavorites = db.prepare('DELETE FROM favorites WHERE session_id = ?');

  function saveFavorite(sessionId, beer) {
    _saveFavorite.run({
      session_id: sessionId,
      beer_id:    beer.id || beer.beer_id,
      beer_name:  beer.name || beer.beer_name,
      brewery_id: beer.breweryId  || beer.brewery_id  || null,
      brewery_name: beer.breweryName || beer.brewery_name || null,
      style:  beer.style  || null,
      rating: beer.rating || null,
      abv:    beer.abv    || null,
    });
  }
  function deleteFavorite(sessionId, beerId) { return _deleteFavorite.run(sessionId, beerId).changes > 0; }
  function getFavorites(sessionId)           { return _getFavorites.all(sessionId); }
  function isFavorite(sessionId, beerId)     { return !!_isFavorite.get(sessionId, beerId); }
  function clearFavorites(sessionId)         { return _clearFavorites.run(sessionId).changes; }

  // ── Analytics ─────────────────────────────────────────────────────────────────

  const _logSearch   = db.prepare(`
    INSERT INTO searches (zip, brewery_count, beer_count, duration_ms, cache_hit)
    VALUES (@zip, @brewery_count, @beer_count, @duration_ms, @cache_hit)
  `);
  const _searchStats = db.prepare(`
    SELECT COUNT(*) AS total_searches, COUNT(DISTINCT zip) AS unique_zips,
           ROUND(AVG(duration_ms)) AS avg_duration_ms,
           ROUND(AVG(cache_hit) * 100, 1) AS cache_hit_pct,
           (SELECT zip FROM searches GROUP BY zip ORDER BY COUNT(*) DESC LIMIT 1) AS top_zip
    FROM searches WHERE searched_at > unixepoch() - 86400 * 7
  `);
  const _popularZips = db.prepare(`
    SELECT zip, COUNT(*) AS searches FROM searches
    GROUP BY zip ORDER BY searches DESC LIMIT 10
  `);

  function logSearch(zip, { breweryCount, beerCount, durationMs, cacheHit }) {
    try {
      _logSearch.run({
        zip, brewery_count: breweryCount || 0, beer_count: beerCount || 0,
        duration_ms: durationMs || 0, cache_hit: cacheHit ? 1 : 0,
      });
    } catch { /* non-fatal */ }
  }

  function getStats() {
    const counts = db.prepare(`
      SELECT (SELECT COUNT(*) FROM breweries) AS breweries,
             (SELECT COUNT(*) FROM beers)     AS beers,
             (SELECT COUNT(*) FROM events)    AS events,
             (SELECT COUNT(*) FROM searches)  AS searches
    `).get();
    return { counts, weekly: _searchStats.get(), topZips: _popularZips.all() };
  }

  _exports = {
    db,
    getZipCoords, saveZipCoords,
    upsertBrewery, upsertBreweries, getBrewery, getCachedBreweriesNear,
    upsertBeer, upsertBeers, getBeersByBrewery, getTopBeers, getBeer, getSimilarBeers,
    upsertEvent, upsertEvents, getEventsByBrewery, getUpcomingEvents,
    saveFavorite, deleteFavorite, getFavorites, isFavorite, clearFavorites,
    logSearch, getStats,
  };

  console.log(`[db] SQLite ready at ${DB_PATH}`);

} catch (err) {
  console.error(`[db] SQLite unavailable — running without persistence: ${err.message}`);
  _exports = STUBS;
}

module.exports = _exports;
