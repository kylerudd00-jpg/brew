/**
 * GET /beer/:id
 *
 * Optional query params:
 *   lat, lng, radius   — user's search location (filters similar beers to nearby)
 *
 * Fallback params (used when the beer isn't in the DB — e.g. cold serverless start):
 *   name, style, styleCategory, abv, rating, reviewCount,
 *   breweryId, breweryName, breweryAddress, breweryWebsite,
 *   ibuLabel, ibuLevel, ibuRange, foodPairing,
 *   isSeasonal, seasonType, seasonEmoji, isHiddenGem
 */

const express = require('express');
const db      = require('../db');
const cache   = require('../cache');
const { getIbuInfo, getFoodPairing, getSeasonalInfo } = require('../services/enrichment');

const router = express.Router();

function haversine(lat1, lng1, lat2, lng2) {
  const R    = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get('/:id', (req, res) => {
  const { id }  = req.params;
  const q       = req.query;

  const userLat    = q.lat    ? parseFloat(q.lat)    : null;
  const userLng    = q.lng    ? parseFloat(q.lng)    : null;
  const userRadius = q.radius ? parseFloat(q.radius) : 50;

  const locKey   = (userLat != null && userLng != null)
    ? `:${userLat.toFixed(3)},${userLng.toFixed(3)}`
    : '';
  const cacheKey = `beer:${id}${locKey}`;
  const cached   = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  // ── Try DB first ────────────────────────────────────────────────────────────
  let beer = db.getBeer(id);

  // ── Fallback: reconstruct from query params when DB is cold ─────────────────
  // This handles Vercel cold starts where the in-memory stub Map is empty.
  if (!beer && q.name) {
    const styleCategory = q.styleCategory || q.style || 'Other';
    const ibu      = getIbuInfo(styleCategory);
    const pairing  = getFoodPairing(styleCategory);
    const seasonal = getSeasonalInfo(q.name, styleCategory);

    beer = {
      id,
      name:            q.name,
      style:           q.style           || styleCategory,
      style_category:  styleCategory,
      abv:             parseFloat(q.abv) || 5.5,
      rating:          parseFloat(q.rating)      || 0,
      review_count:    parseInt(q.reviewCount)   || 0,
      source:          'reconstructed',
      ibu_label:       q.ibuLabel    || ibu.label,
      ibu_level:       q.ibuLevel != null ? parseInt(q.ibuLevel) : ibu.level,
      ibu_range:       q.ibuRange    || ibu.range,
      food_pairing:    q.foodPairing || pairing,
      is_seasonal:     q.isSeasonal === 'true' || seasonal.isSeasonal ? 1 : 0,
      season_type:     q.seasonType  || seasonal.seasonType,
      season_emoji:    q.seasonEmoji || seasonal.seasonEmoji,
      brewery_id:      q.breweryId      || null,
      brewery_name:    q.breweryName    || null,
      brewery_address: q.breweryAddress || null,
      brewery_website: q.breweryWebsite || null,
      lat:             q.breweryLat ? parseFloat(q.breweryLat) : null,
      lng:             q.breweryLng ? parseFloat(q.breweryLng) : null,
    };
  }

  if (!beer) {
    return res.status(404).json({
      error: 'Beer not found — try searching for a location first to populate the cache.',
    });
  }

  const events  = beer.brewery_id ? db.getEventsByBrewery(beer.brewery_id) : [];
  const similar = db.getSimilarBeers(id, beer.style_category, {
    lat: userLat ?? beer.lat,
    lng: userLng ?? beer.lng,
    radiusMiles: userRadius,
    limit: 6,
  });

  let distanceMiles = null;
  if (userLat != null && userLng != null && beer.lat && beer.lng) {
    distanceMiles = parseFloat(haversine(userLat, userLng, beer.lat, beer.lng).toFixed(2));
  }

  const isHiddenGem = (beer.rating >= 4.0 && beer.review_count <= 80)
    || q.isHiddenGem === 'true';

  const payload = {
    beer: {
      id:            beer.id,
      name:          beer.name,
      style:         beer.style,
      styleCategory: beer.style_category,
      abv:           beer.abv,
      rating:        beer.rating,
      reviewCount:   beer.review_count,
      source:        beer.source,
      ibuLabel:      beer.ibu_label    || null,
      ibuLevel:      beer.ibu_level    ?? null,
      ibuRange:      beer.ibu_range    || null,
      foodPairing:   beer.food_pairing || null,
      isSeasonal:    beer.is_seasonal  ? true : false,
      seasonType:    beer.season_type  || null,
      seasonEmoji:   beer.season_emoji || null,
      isHiddenGem,
    },
    brewery: {
      id:            beer.brewery_id,
      name:          beer.brewery_name    || null,
      address:       beer.brewery_address || null,
      website:       beer.brewery_website && beer.brewery_website !== '#'
                       ? beer.brewery_website : null,
      lat:           beer.lat || null,
      lng:           beer.lng || null,
      distanceMiles,
    },
    events: events.map(e => ({
      id:          e.id,
      name:        e.name,
      date:        e.date,
      url:         e.url && e.url !== '#' ? e.url : null,
      breweryName: e.brewery_name || null,
      source:      e.source || null,
    })),
    similar: similar.map(s => ({
      id:          s.id,
      name:        s.name,
      style:       s.style,
      abv:         s.abv,
      rating:      s.rating,
      reviewCount: s.review_count,
      breweryId:   s.brewery_id,
      breweryName: s.brewery_name,
      website:     s.brewery_website || null,
    })),
    reconstructed: beer.source === 'reconstructed',
  };

  // Only cache DB-backed results; reconstructed ones are ephemeral
  if (beer.source !== 'reconstructed') {
    cache.set(cacheKey, payload, 1800);
  }
  return res.json(payload);
});

module.exports = router;
