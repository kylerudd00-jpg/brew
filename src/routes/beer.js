/**
 * GET /beer/:id
 *
 * Returns full detail for a single beer by its stable DB id:
 *   - beer metadata (name, style, abv, rating, reviewCount)
 *   - parent brewery info
 *   - upcoming events at the brewery
 *   - similar beers (same style category, top rated, up to 5)
 *
 * Beer IDs are returned in every /search and /brewery/:id response.
 */

const express = require('express');
const db      = require('../db');
const cache   = require('../cache');

const router = express.Router();

router.get('/:id', (req, res) => {
  const { id } = req.params;

  const cacheKey = `beer:${id}`;
  const cached   = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  const beer = db.getBeer(id);
  if (!beer) {
    return res.status(404).json({
      error: 'Beer not found. Run /search?zip= first to populate the database.',
    });
  }

  const events  = db.getEventsByBrewery(beer.brewery_id);
  const similar = db.getSimilarBeers(id, beer.style_category, 5);

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
    },
    brewery: {
      id:      beer.brewery_id,
      name:    beer.brewery_name,
      address: beer.brewery_address,
      website: beer.brewery_website,
      lat:     beer.lat,
      lng:     beer.lng,
    },
    events: events.map(e => ({
      id:   e.id,
      name: e.name,
      date: e.date,
      url:  e.url,
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
    })),
  };

  cache.set(cacheKey, payload, 1800);
  return res.json(payload);
});

module.exports = router;
