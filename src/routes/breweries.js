/**
 * GET /breweries?zip=XXXXX
 *
 * Lightweight endpoint — returns the raw brewery list without
 * scraping tap lists or scoring beers. Useful for map views.
 */

const express = require('express');
const cache = require('../cache');
const { geocodeZip } = require('../services/geocoder');
const { getNearbyBreweries } = require('../services/places');

const router = express.Router();
const RADIUS_MILES = parseFloat(process.env.SEARCH_RADIUS_MILES || '15');

router.get('/', async (req, res, next) => {
  try {
    const zip = (req.query.zip || '').trim();
    if (!/^\d{5}$/.test(zip)) {
      return res.status(400).json({ error: 'zip must be a 5-digit US ZIP code' });
    }

    const cacheKey = `breweries:${zip}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ ...cached, meta: { ...cached.meta, fromCache: true } });

    const coords = await geocodeZip(zip);
    const breweries = await getNearbyBreweries(coords, RADIUS_MILES);

    const response = {
      zip,
      breweries,
      meta: { count: breweries.length, radiusMiles: RADIUS_MILES },
    };
    cache.set(cacheKey, response);
    return res.json(response);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
