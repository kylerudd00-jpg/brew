/**
 * GET /search
 *
 * Query params:
 *   zip        {string}  required — 5-digit US ZIP
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
const { geocodeZip }         = require('../services/geocoder');
const { getNearbyBreweries } = require('../services/places');
const { scrapeTapList, scrapeEvents } = require('../services/scraper');
const { getEventbriteEvents }         = require('../services/eventbrite');
const { simulateRatings }    = require('../services/ratings');
const { enrichBeers }        = require('../services/enrichment');
const { rankBeers }          = require('../scoring/beerScorer');

const router = express.Router();
const limit  = pLimit(4);

const DEFAULT_RADIUS = parseFloat(process.env.SEARCH_RADIUS_MILES || '15');
const DEFAULT_LIMIT  = 5;
const MAX_LIMIT      = 20;
const MAX_MILES      = 50;

router.get('/', async (req, res, next) => {
  const t0 = Date.now();

  try {
    // ── Parse & validate params ──────────────────────────────────────────────
    const zip       = (req.query.zip || '').trim();
    const style     = req.query.style     || null;
    const minRating = req.query.minRating ? parseFloat(req.query.minRating) : null;
    const maxMiles  = req.query.maxMiles
      ? Math.min(parseFloat(req.query.maxMiles), MAX_MILES)
      : DEFAULT_RADIUS;
    const sortBy    = ['score', 'rating', 'distance', 'reviews'].includes(req.query.sort)
      ? req.query.sort
      : 'score';
    const limit_    = Math.min(
      parseInt(req.query.limit || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT,
      MAX_LIMIT
    );
    const page      = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const offset    = (page - 1) * limit_;

    if (!/^\d{5}$/.test(zip)) {
      return res.status(400).json({ error: 'zip must be a 5-digit US ZIP code' });
    }
    if (minRating !== null && (minRating < 0 || minRating > 5)) {
      return res.status(400).json({ error: 'minRating must be 0–5' });
    }

    // ── Cache (skip if filters active) ───────────────────────────────────────
    const hasFilters = style || minRating !== null || maxMiles !== DEFAULT_RADIUS || limit_ !== DEFAULT_LIMIT || sortBy !== 'score' || page > 1;
    const cacheKey   = hasFilters
      ? `search:${zip}:${style}:${minRating}:${maxMiles}:${sortBy}:${limit_}:${page}`
      : `search:${zip}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      db.logSearch(zip, { ...cached.meta, durationMs: Date.now() - t0, cacheHit: true });
      return res.json({ ...cached, meta: { ...cached.meta, fromCache: true } });
    }

    // ── Geocode ──────────────────────────────────────────────────────────────
    const coords = await geocodeZip(zip);

    // ── Find breweries ───────────────────────────────────────────────────────
    const breweries = await getNearbyBreweries(coords, maxMiles);
    db.upsertBreweries(breweries);

    if (!breweries.length) {
      return res.json({ zip, topBeers: [], allEvents: [], meta: { breweryCount: 0, beerCount: 0, radiusMiles: maxMiles } });
    }

    // ── Scrape + Eventbrite (parallel) ───────────────────────────────────────
    const [ebEvents, breweryData] = await Promise.all([
      getEventbriteEvents(coords, maxMiles),
      Promise.all(
        breweries.map(brewery =>
          limit(async () => {
            const [beerNames, scrapedEvents] = await Promise.all([
              scrapeTapList(brewery.website),
              scrapeEvents(brewery.website, brewery.id, brewery.name),
            ]);
            return { brewery, beerNames, scrapedEvents };
          })
        )
      ),
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

      // upsert and capture stable DB IDs
      const beersWithIds = enriched.map(b => {
        const id = db.upsertBeer({ ...b, breweryId: brewery.id });
        return { ...b, id };
      });

      const firstWord = brewery.name.toLowerCase().split(' ')[0];
      const breweryEvents = [
        ...scrapedEvents,
        ...ebEvents.filter(e => e.venueName?.toLowerCase().includes(firstWord)),
      ];
      db.upsertEvents(scrapedEvents);

      for (const beer of beersWithIds) {
        // Apply filters
        if (style     && beer.style_category !== style)  continue;
        if (minRating && beer.rating < minRating)         continue;

        allBeers.push({ ...beer, brewery, events: breweryEvents });
      }
    }

    // ── Sort ──────────────────────────────────────────────────────────────────
    let ranked;
    if (sortBy === 'score') {
      ranked = rankBeers(allBeers);
    } else {
      ranked = [...allBeers].sort((a, b) => {
        if (sortBy === 'rating')   return b.rating - a.rating;
        if (sortBy === 'distance') return a.brewery.distanceMiles - b.brewery.distanceMiles;
        if (sortBy === 'reviews')  return b.reviewCount - a.reviewCount;
        return 0;
      }).map(beer => ({
        ...beer,
        score: rankBeers([beer])[0]?.score ?? 0,
        breweryId:      beer.brewery.id,
        breweryName:    beer.brewery.name,
        breweryAddress: beer.brewery.address,
        distanceMiles:  beer.brewery.distanceMiles,
        breweryWebsite: beer.brewery.website,
      }));
    }

    const topBeers  = ranked.slice(offset, offset + limit_);

    // ── Collect events ────────────────────────────────────────────────────────
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

    // ── Respond ───────────────────────────────────────────────────────────────
    const response = {
      zip,
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
    db.logSearch(zip, { breweryCount: breweries.length, beerCount: allBeers.length, durationMs: Date.now() - t0 });

    return res.json(response);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
