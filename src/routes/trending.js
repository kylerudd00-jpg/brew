/**
 * GET /trending
 *
 * Returns the top-rated beers across ALL cached brewery data in the DB.
 * Unlike /search, this isn't location-scoped — it's a global leaderboard
 * of every beer that has been seen in any search.
 *
 * Query params:
 *   style      {string}  filter by style category
 *   minRating  {number}  minimum rating (default 3.5)
 *   limit      {number}  default 10, max 50
 */

const express = require('express');
const db      = require('../db');
const cache   = require('../cache');
const { ALL_STYLE_CATEGORIES } = require('../services/enrichment');

const router = express.Router();

router.get('/', (req, res) => {
  const style     = req.query.style     || null;
  const minRating = parseFloat(req.query.minRating || '3.5');
  const limit     = Math.min(parseInt(req.query.limit || '10', 10), 50);

  if (style && !ALL_STYLE_CATEGORIES.includes(style)) {
    return res.status(400).json({
      error: `Unknown style. Valid options: ${ALL_STYLE_CATEGORIES.join(', ')}`,
    });
  }

  const cacheKey = `trending:${style}:${minRating}:${limit}`;
  const cached   = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  const beers = db.getTopBeers({ style, minRating, limit });

  // Shape response — include brewery info
  const result = beers.map(b => ({
    name:           b.name,
    style:          b.style,
    styleCategory:  b.style_category,
    abv:            b.abv,
    rating:         b.rating,
    reviewCount:    b.review_count,
    breweryId:      b.brewery_id,
    breweryName:    b.brewery_name,
    breweryAddress: b.brewery_address,
    breweryWebsite: b.brewery_website,
  }));

  const payload = {
    beers: result,
    meta: {
      count:          result.length,
      style:          style || 'all',
      minRating,
      generatedAt:    new Date().toISOString(),
      note: result.length === 0
        ? 'No data yet. Run /search?zip= to populate the database.'
        : undefined,
    },
  };

  cache.set(cacheKey, payload, 300); // 5 min — trending should feel fresh
  return res.json(payload);
});

// ── GET /styles — list all valid style categories ────────────────────────────
router.get('/styles', (_req, res) => {
  res.json({ styles: ALL_STYLE_CATEGORIES });
});

module.exports = router;
