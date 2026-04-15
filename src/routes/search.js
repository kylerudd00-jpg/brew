/**
 * GET /search
 *
 * Query params:
 *   q          {string}  required — 5-digit US ZIP OR city name (e.g. "Austin, TX")
 *   zip        {string}  alias for q (legacy)
 *   style      {string}  optional — filter by style category (e.g. IPA, Stout)
 *   minRating  {number}  optional — minimum beer rating (0-5)
 *   maxMiles   {number}  optional — override radius (max 50)
 *   sort       {string}  optional — score (default) | rating | distance | reviews
 *   limit      {number}  optional — results per page (default 5, max 20)
 *   page       {number}  optional — 1-based page number (default 1)
 */

const express = require('express');
const pLimit  = require('p-limit');

const cache    = require('../cache');
const db       = require('../db');
const { geocodeZip, geocodeQuery } = require('../services/geocoder');
const { getNearbyBreweries }       = require('../services/places');
const { scrapeTapList, scrapeEvents } = require('../services/scraper');
const { getEventbriteEvents }         = require('../services/eventbrite');
const { simulateRatings }    = require('../services/ratings');
const { enrichBeers }        = require('../services/enrichment');
const { getMockResponse }    = require('../services/mock');
const { rankBeers }          = require('../scoring/beerScorer');

const router = express.Router();
const limiter = pLimit(4);

const DEFAULT_RADIUS   = parseFloat(process.env.SEARCH_RADIUS_MILES || '15');
const DEFAULT_LIMIT    = 5;
const MAX_LIMIT        = 20;
const MAX_MILES        = 50;
const SCRAPE_BUDGET_MS = parseInt(process.env.SCRAPE_BUDGET_MS || '1500', 10);

function shouldUseMockFallback(err) {
  const status  = err.response?.status || err.status || null;
  const code    = err.code || err.cause?.code || '';
  const message = err.message || '';
  if (status && status >= 500) return true;
  if (['EAI_AGAIN', 'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes(code)) return true;
  return /network error|getaddrinfo|socket hang up|timed out/i.test(message);
}

async function scrapeBreweryWithinBudget(brewery) {
  if (!brewery.website) {
    console.log(`[search] No website for ${brewery.name} — skipping scrape`);
    return { brewery, beerNames: [], scrapedEvents: [] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPE_BUDGET_MS);

  try {
    const [beerNames, scrapedEvents] = await Promise.all([
      scrapeTapList(brewery.website, { signal: controller.signal }),
      scrapeEvents(brewery.website, brewery.id, brewery.name, { signal: controller.signal }),
    ]);
    return { brewery, beerNames, scrapedEvents };
  } catch (err) {
    if (controller.signal.aborted || err.code === 'ABORT_ERR' || err.code === 'ERR_CANCELED') {
      return { brewery, beerNames: [], scrapedEvents: [] };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

router.get('/', async (req, res, next) => {
  const t0 = Date.now();

  try {
    // ── Parse & validate params ──────────────────────────────────────────────
    // Accept ?q= (city or zip) or legacy ?zip=
    const rawQuery  = (req.query.q || req.query.zip || '').trim();
    const style     = req.query.style     || null;
    const minRating = req.query.minRating ? parseFloat(req.query.minRating) : null;
    const maxMiles  = req.query.maxMiles
      ? Math.min(parseFloat(req.query.maxMiles), MAX_MILES)
      : DEFAULT_RADIUS;
    const sortBy    = ['score', 'rating', 'distance', 'reviews'].includes(req.query.sort)
      ? req.query.sort : 'score';
    const limit_    = Math.min(
      parseInt(req.query.limit || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT,
      MAX_LIMIT
    );
    const page      = Math.max(1, Math.min(100, parseInt(req.query.page || '1', 10) || 1));
    const offset    = (page - 1) * limit_;

    if (!rawQuery) {
      return res.status(400).json({ error: 'Provide a ZIP code or city name in the ?q= parameter' });
    }
    if (minRating !== null && (minRating < 0 || minRating > 5)) {
      return res.status(400).json({ error: 'minRating must be 0–5' });
    }

    // ── Geocode ──────────────────────────────────────────────────────────────
    // Support both ZIP and city name via unified geocodeQuery
    let coords;
    let displayName;
    let breweries;

    try {
      const geo = await geocodeQuery(rawQuery);
      coords      = { lat: geo.lat, lng: geo.lng };
      displayName = geo.displayName || rawQuery;

      // Also save ZIP to DB if it was a ZIP lookup
      if (/^\d{5}$/.test(rawQuery)) {
        db.saveZipCoords(rawQuery, geo.lat, geo.lng);
      }

      breweries = await getNearbyBreweries(coords, maxMiles);
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).json({ error: err.message });
      }

      if (!process.env.GOOGLE_API_KEY && shouldUseMockFallback(err)) {
        console.warn(`[search] Live discovery unavailable for "${rawQuery}"; serving mock results: ${err.message}`);
        const response = getMockResponse(rawQuery, { style, minRating, maxMiles, sortBy, limit: limit_, page });
        const cacheKey = `search:${rawQuery}`;
        cache.set(cacheKey, response);
        db.logSearch(rawQuery, { breweryCount: response.meta.breweryCount, beerCount: response.meta.beerCount, durationMs: Date.now() - t0 });
        return res.json(response);
      }

      throw err;
    }

    // ── Cache (skip if filters active) ───────────────────────────────────────
    const hasFilters = style || minRating !== null || maxMiles !== DEFAULT_RADIUS || limit_ !== DEFAULT_LIMIT || sortBy !== 'score' || page > 1;
    const cacheKey   = hasFilters
      ? `search:${rawQuery}:${style}:${minRating}:${maxMiles}:${sortBy}:${limit_}:${page}`
      : `search:${rawQuery}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      db.logSearch(rawQuery, { ...cached.meta, durationMs: Date.now() - t0, cacheHit: true });
      return res.json({ ...cached, meta: { ...cached.meta, fromCache: true } });
    }

    db.upsertBreweries(breweries);

    if (!breweries.length) {
      return res.json({
        zip: rawQuery,
        displayName,
        coords,
        topBeers: [],
        allEvents: [],
        meta: { breweryCount: 0, beerCount: 0, radiusMiles: maxMiles },
      });
    }

    // ── Scrape + Eventbrite (parallel) ───────────────────────────────────────
    const [ebEvents, breweryData] = await Promise.all([
      getEventbriteEvents(coords, maxMiles),
      Promise.all(breweries.map(brewery => limiter(() => scrapeBreweryWithinBudget(brewery)))),
    ]);

    db.upsertEvents(ebEvents);

    // ── Build beer list ───────────────────────────────────────────────────────
    const allBeers = [];

    for (const { brewery, beerNames, scrapedEvents } of breweryData) {
      const rawNames = beerNames.length > 0
        ? beerNames
        : [`${brewery.name} House Lager`, `${brewery.name} IPA`];

      const ratings  = simulateRatings(rawNames, brewery.id);
      const enriched = enrichBeers(ratings.map(r => ({ ...r, brewery_id: brewery.id })));

      const beersWithIds = enriched.map(b => {
        const bId = db.upsertBeer({ ...b, breweryId: brewery.id });
        return { ...b, id: bId };
      });

      // Match Eventbrite events to this brewery using full name similarity (not just first word)
      const brewName = brewery.name.toLowerCase();
      const breweryEvents = [
        ...scrapedEvents,
        ...ebEvents.filter(e => {
          if (!e.venueName) return false;
          const vName = e.venueName.toLowerCase();
          // Match if venue name contains most of the brewery name words
          const words = brewName.split(/\s+/).filter(w => w.length > 3);
          return words.length > 0 && words.some(w => vName.includes(w));
        }),
      ];
      db.upsertEvents(scrapedEvents);

      for (const beer of beersWithIds) {
        if (style     && beer.style_category !== style)  continue;
        if (minRating && beer.rating < minRating)         continue;
        allBeers.push({ ...beer, brewery, events: breweryEvents });
      }
    }

    // ── Sort & score ──────────────────────────────────────────────────────────
    // Always run rankBeers on the full list first to get composite scores + enrichment fields
    const fullyRanked = rankBeers(allBeers);

    let ranked;
    if (sortBy === 'score') {
      ranked = fullyRanked;
    } else {
      // Re-sort by requested field but keep all enrichment fields from rankBeers
      const scoreMap = new Map(fullyRanked.map(b => [b.id, b]));
      ranked = allBeers
        .map(beer => scoreMap.get(db.upsertBeer({ ...beer, breweryId: beer.brewery.id })) || fullyRanked.find(b => b.name === beer.name))
        .filter(Boolean);

      if (sortBy === 'rating')   ranked.sort((a, b) => b.rating - a.rating);
      if (sortBy === 'distance') ranked.sort((a, b) => a.distanceMiles - b.distanceMiles);
      if (sortBy === 'reviews')  ranked.sort((a, b) => b.reviewCount - a.reviewCount);
    }

    const topBeers = ranked.slice(offset, offset + limit_);

    // ── Collect & sort events ────────────────────────────────────────────────
    const seenIds  = new Set();
    const allEvents = [];
    for (const beer of topBeers) {
      for (const ev of beer.events || []) {
        if (!seenIds.has(ev.id)) { seenIds.add(ev.id); allEvents.push(ev); }
      }
    }
    for (const ev of ebEvents) {
      if (!seenIds.has(ev.id)) { seenIds.add(ev.id); allEvents.push(ev); }
    }
    // Sort events by date ascending (null dates go to end)
    allEvents.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });

    // ── Respond ───────────────────────────────────────────────────────────────
    const response = {
      zip:         rawQuery,
      displayName,
      coords,
      topBeers,
      allEvents,
      filters: hasFilters ? { style, minRating, maxMiles, sortBy, limit: limit_ } : undefined,
      meta: {
        breweryCount: breweries.length,
        beerCount:    allBeers.length,
        totalBeers:   ranked.length,
        page,
        limit:        limit_,
        totalPages:   Math.ceil(ranked.length / limit_),
        radiusMiles:  maxMiles,
        cachedAt:     new Date().toISOString(),
        fromCache:    false,
      },
    };

    cache.set(cacheKey, response);
    db.logSearch(rawQuery, { breweryCount: breweries.length, beerCount: allBeers.length, durationMs: Date.now() - t0 });

    return res.json(response);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
