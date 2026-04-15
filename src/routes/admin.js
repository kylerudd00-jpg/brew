/**
 * Admin endpoints — internal stats and cache management.
 *
 * Protected by ADMIN_KEY env var when set.
 * Add `x-admin-key: <your-key>` header to all admin requests in production.
 */

const express = require('express');
const db      = require('../db');
const cache   = require('../cache');

const router = express.Router();

// ── Auth guard ────────────────────────────────────────────────────────────────
router.use((req, res, next) => {
  const key = process.env.ADMIN_KEY;
  if (!key) return next(); // No key configured → allow all (dev mode)
  if (req.headers['x-admin-key'] !== key) {
    return res.status(403).json({ error: 'Forbidden — x-admin-key required' });
  }
  next();
});

// ── GET /admin/stats ─────────────────────────────────────────────────────────
router.get('/stats', (_req, res) => {
  const stats = db.getStats();
  const cacheStats = cache.getStats();

  res.json({
    db:    stats,
    cache: {
      keys:   cacheStats.keys,
      hits:   cacheStats.hits,
      misses: cacheStats.misses,
      hitRate: cacheStats.hits + cacheStats.misses > 0
        ? `${((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1)}%`
        : 'n/a',
    },
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      memoryMB:      Math.round(process.memoryUsage().rss / 1024 / 1024),
      nodeVersion:   process.version,
    },
  });
});

// ── POST /admin/cache/clear ───────────────────────────────────────────────────
router.post('/cache/clear', (req, res) => {
  const { prefix } = req.body || {};

  if (prefix) {
    // Clear only keys matching a prefix (e.g. "search:" or "brewery:")
    const keys    = cache.keys();
    const targets = keys.filter(k => k.startsWith(prefix));
    targets.forEach(k => cache.del(k));
    return res.json({ cleared: targets.length, prefix });
  }

  cache.flushAll();
  return res.json({ cleared: 'all' });
});

// ── GET /admin/db/beers ───────────────────────────────────────────────────────
router.get('/db/beers', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);

  const beers = db.db.prepare(`
    SELECT b.*, br.name AS brewery_name
    FROM beers b
    JOIN breweries br ON b.brewery_id = br.id
    ORDER BY b.rating DESC, b.review_count DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  res.json({ beers, limit, offset });
});

// ── GET /admin/db/searches ────────────────────────────────────────────────────
router.get('/db/searches', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);

  const rows = db.db.prepare(`
    SELECT * FROM searches
    ORDER BY searched_at DESC
    LIMIT ?
  `).all(limit);

  res.json({
    searches: rows.map(r => ({
      ...r,
      searched_at: new Date(r.searched_at * 1000).toISOString(),
    })),
  });
});

// ── DELETE /admin/db/old-events ───────────────────────────────────────────────
router.delete('/db/old-events', (_req, res) => {
  const result = db.db.prepare(`
    DELETE FROM events
    WHERE date IS NOT NULL AND date < date('now')
  `).run();
  res.json({ deleted: result.changes });
});

// ── GET /admin/analytics ──────────────────────────────────────────────────────
router.get('/analytics', (_req, res) => {
  const topStyles = db.db.prepare(`
    SELECT style_category AS style, COUNT(*) AS beerCount,
           ROUND(AVG(rating), 2) AS avgRating
    FROM beers
    WHERE style_category IS NOT NULL AND available = 1
    GROUP BY style_category
    ORDER BY beerCount DESC
    LIMIT 15
  `).all();

  const topRatedBeers = db.db.prepare(`
    SELECT b.name, b.rating, b.review_count, b.style_category,
           br.name AS brewery_name
    FROM beers b JOIN breweries br ON b.brewery_id = br.id
    WHERE b.available = 1
    ORDER BY b.rating DESC, b.review_count DESC
    LIMIT 10
  `).all();

  const recentSearches = db.db.prepare(`
    SELECT zip, COUNT(*) AS searches,
           MAX(datetime(searched_at, 'unixepoch')) AS last_search
    FROM searches
    WHERE searched_at > unixepoch() - 86400
    GROUP BY zip
    ORDER BY searches DESC
    LIMIT 10
  `).all();

  const favoritesCount = db.db.prepare(
    'SELECT COUNT(*) AS total, COUNT(DISTINCT session_id) AS sessions FROM favorites'
  ).get();

  res.json({ topStyles, topRatedBeers, recentSearches, favorites: favoritesCount });
});

// ── POST /admin/db/vacuum ─────────────────────────────────────────────────────
router.post('/db/vacuum', (_req, res) => {
  // Remove beers not seen in 30 days
  const beers = db.db.prepare(
    `UPDATE beers SET available = 0 WHERE last_seen < unixepoch() - 86400 * 30`
  ).run();
  // Remove past events older than 7 days
  const events = db.db.prepare(
    `DELETE FROM events WHERE date IS NOT NULL AND date < date('now', '-7 days')`
  ).run();
  res.json({ beersMarkedStale: beers.changes, eventsDeleted: events.changes });
});

module.exports = router;
