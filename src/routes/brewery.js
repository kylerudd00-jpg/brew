/**
 * GET /brewery/:id
 *
 * Returns full brewery detail: info, all beers from DB, upcoming events.
 * Falls back to live scrape if DB has no beers for this brewery.
 *
 * GET /brewery/:id/refresh
 * Forces a fresh scrape of the brewery's website (bypasses cache).
 */

const express = require('express');
const db      = require('../db');
const cache   = require('../cache');
const { scrapeTapList, scrapeEvents } = require('../services/scraper');
const { simulateRatings }  = require('../services/ratings');
const { enrichBeers }      = require('../services/enrichment');
const { rankBeers }        = require('../scoring/beerScorer');
const { getMockResponse }  = require('../services/mock');

const router = express.Router();

// ── GET /brewery/:id ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Mock mode
    if (!process.env.GOOGLE_API_KEY) {
      const mock = getMockResponse('00000');
      const found = mock.topBeers.find(b => b.breweryId === id);
      if (!found) return res.status(404).json({ error: 'Brewery not found. Try running a /search first.' });
      return res.json({ brewery: { id, name: found.breweryName }, beers: [], events: [] });
    }

    const cacheKey = `brewery:${id}`;
    const cached   = cache.get(cacheKey);
    if (cached) return res.json({ ...cached, fromCache: true });

    // Pull from DB
    const brewery = db.getBrewery(id);
    if (!brewery) {
      return res.status(404).json({
        error: 'Brewery not found. Run a /search?zip= first to populate the database.',
      });
    }

    let beers = db.getBeersByBrewery(id);

    // Fresh scrape if DB has no beers
    if (beers.length === 0) {
      const names    = await scrapeTapList(brewery.website);
      const ratings  = simulateRatings(names.length ? names : [`${brewery.name} IPA`], id);
      const enriched = enrichBeers(ratings.map(r => ({ ...r, brewery_id: id })));
      enriched.forEach(b => db.upsertBeer({ ...b, breweryId: id }));
      beers = db.getBeersByBrewery(id);
    }

    const events  = db.getEventsByBrewery(id);
    const scrEvs  = await scrapeEvents(brewery.website, id, brewery.name);
    db.upsertEvents(scrEvs);
    const allEvents = [
      ...scrEvs,
      ...events.filter(e => !scrEvs.find(s => s.id === e.id)),
    ].slice(0, 10);

    // Score beers relative to each other
    const beerObjects = beers.map(b => ({
      ...b,
      id:          b.id,
      reviewCount: b.review_count,
      brewery:     { ...brewery, distanceMiles: 0 },
      events:      [],
    }));
    const ranked = rankBeers(beerObjects);

    const payload = { brewery, beers: ranked, events: allEvents };
    cache.set(cacheKey, payload, 1800); // 30 min

    return res.json(payload);
  } catch (err) {
    next(err);
  }
});

// ── GET /brewery/:id/refresh ─────────────────────────────────────────────────
router.get('/:id/refresh', async (req, res, next) => {
  try {
    const { id } = req.params;
    const brewery = db.getBrewery(id);
    if (!brewery) return res.status(404).json({ error: 'Brewery not found' });

    // Clear cache entry
    cache.del(`brewery:${id}`);

    const [names, events] = await Promise.all([
      scrapeTapList(brewery.website),
      scrapeEvents(brewery.website, id, brewery.name),
    ]);

    const ratings  = simulateRatings(names.length ? names : [`${brewery.name} IPA`], id);
    const enriched = enrichBeers(ratings.map(r => ({ ...r, brewery_id: id })));
    db.upsertBeers(enriched.map(b => ({ ...b, breweryId: id })));
    db.upsertEvents(events);

    return res.json({
      refreshed: true,
      beersFound: names.length,
      eventsFound: events.length,
      brewery: brewery.name,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
