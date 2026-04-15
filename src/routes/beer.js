/**
 * GET /beer/:id[?lat=&lng=&radius=]
 *
 * Returns full detail for a single beer by its stable DB id:
 *   - beer metadata (name, style, abv, rating, reviewCount, IBU, food pairing, seasonal)
 *   - parent brewery info (name, address, website, distanceMiles if coords supplied)
 *   - upcoming events at the brewery
 *   - similar beers (same style, nearby only — filtered by lat/lng when provided)
 *
 * Optional query params:
 *   lat    {number}  user's search latitude  (for distance calc + similar filter)
 *   lng    {number}  user's search longitude
 *   radius {number}  max radius for similar beers in miles (default 50)
 */

const express = require('express');
const db      = require('../db');
const cache   = require('../cache');

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
  const { id } = req.params;

  // Optional location context from the frontend
  const userLat    = req.query.lat    ? parseFloat(req.query.lat)    : null;
  const userLng    = req.query.lng    ? parseFloat(req.query.lng)    : null;
  const userRadius = req.query.radius ? parseFloat(req.query.radius) : 50;

  // Include location in cache key so different search locations get different similar beers
  const locKey  = (userLat != null && userLng != null)
    ? `:${userLat.toFixed(3)},${userLng.toFixed(3)}`
    : '';
  const cacheKey = `beer:${id}${locKey}`;
  const cached   = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  const beer = db.getBeer(id);
  if (!beer) {
    return res.status(404).json({
      error: 'Beer not found. Run /search?zip= first to populate the database.',
    });
  }

  const events  = db.getEventsByBrewery(beer.brewery_id);
  const similar = db.getSimilarBeers(id, beer.style_category, {
    lat: userLat ?? beer.lat,
    lng: userLng ?? beer.lng,
    radiusMiles: userRadius,
    limit: 6,
  });

  // Calculate distance to brewery if we have coordinates
  let distanceMiles = null;
  if (userLat != null && userLng != null && beer.lat && beer.lng) {
    distanceMiles = parseFloat(haversine(userLat, userLng, beer.lat, beer.lng).toFixed(2));
  }

  const payload = {
    beer: {
      id:           beer.id,
      name:         beer.name,
      style:        beer.style,
      styleCategory: beer.style_category,
      abv:          beer.abv,
      rating:       beer.rating,
      reviewCount:  beer.review_count,
      source:       beer.source,
      // Enrichment fields (stored in beer row if populated, else null)
      ibuLabel:     beer.ibu_label    || null,
      ibuLevel:     beer.ibu_level    ?? null,
      ibuRange:     beer.ibu_range    || null,
      foodPairing:  beer.food_pairing || null,
      isSeasonal:   beer.is_seasonal  ? true : false,
      seasonType:   beer.season_type  || null,
      seasonEmoji:  beer.season_emoji || null,
      isHiddenGem:  (beer.rating >= 4.0 && beer.review_count <= 80),
    },
    brewery: {
      id:            beer.brewery_id,
      name:          beer.brewery_name,
      address:       beer.brewery_address || null,
      website:       beer.brewery_website  || null,
      lat:           beer.lat  || null,
      lng:           beer.lng  || null,
      distanceMiles: distanceMiles,
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
  };

  cache.set(cacheKey, payload, 1800);
  return res.json(payload);
});

module.exports = router;
