/**
 * Background data refresher.
 *
 * Runs on an interval and re-scrapes the tap lists for breweries whose
 * data has gone stale (> STALE_HOURS old). This keeps the DB fresh without
 * blocking any user requests.
 *
 * The job is designed to be lightweight — it processes one brewery at a time
 * with a delay between each to avoid overwhelming brewery websites.
 */

const db                       = require('../db');
const { scrapeTapList,
        scrapeEvents }         = require('../services/scraper');
const { simulateRatings }      = require('../services/ratings');
const { enrichBeers }          = require('../services/enrichment');

const STALE_HOURS    = parseInt(process.env.REFRESH_STALE_HOURS  || '6',  10);
const RUN_INTERVAL   = parseInt(process.env.REFRESH_INTERVAL_MS   || String(30 * 60 * 1000), 10); // 30 min
const BETWEEN_DELAY  = parseInt(process.env.REFRESH_BETWEEN_MS    || '3000', 10);
const MAX_PER_RUN    = parseInt(process.env.REFRESH_MAX_PER_RUN   || '10',  10);

let isRunning = false;

async function runRefreshJob() {
  if (isRunning) return; // prevent overlap
  isRunning = true;

  const staleThreshold = Math.floor(Date.now() / 1000) - STALE_HOURS * 3600;

  try {
    // Find stale breweries that have a website to scrape
    const stale = db.db.prepare(`
      SELECT id, name, website
      FROM breweries
      WHERE website IS NOT NULL
        AND last_updated < ?
      ORDER BY last_updated ASC
      LIMIT ?
    `).all(staleThreshold, MAX_PER_RUN);

    if (!stale.length) {
      console.log(`[refresher] All breweries are fresh — nothing to do`);
      return;
    }

    console.log(`[refresher] Refreshing ${stale.length} stale breweries`);

    for (const brewery of stale) {
      try {
        const [names, events] = await Promise.all([
          scrapeTapList(brewery.website),
          scrapeEvents(brewery.website, brewery.id, brewery.name),
        ]);

        if (names.length > 0) {
          const ratings  = simulateRatings(names, brewery.id);
          const enriched = enrichBeers(ratings.map(r => ({ ...r, brewery_id: brewery.id })));
          db.upsertBeers(enriched.map(b => ({ ...b, breweryId: brewery.id })));
        }

        if (events.length > 0) {
          db.upsertEvents(events);
        }

        // Touch the brewery's last_updated timestamp
        db.db.prepare(`UPDATE breweries SET last_updated = unixepoch() WHERE id = ?`)
          .run(brewery.id);

        console.log(
          `[refresher] ✓ ${brewery.name} — ${names.length} beers, ${events.length} events`
        );
      } catch (err) {
        console.warn(`[refresher] ✗ ${brewery.name}: ${err.message}`);
      }

      // Polite delay between brewery scrapes
      await sleep(BETWEEN_DELAY);
    }
  } catch (err) {
    console.error('[refresher] Job error:', err.message);
  } finally {
    isRunning = false;
  }
}

function start() {
  // First run after a short startup delay
  setTimeout(runRefreshJob, 15_000);

  // Then on interval
  const handle = setInterval(runRefreshJob, RUN_INTERVAL);

  // Don't prevent process exit
  if (handle.unref) handle.unref();

  console.log(`[refresher] Started — interval ${RUN_INTERVAL / 60000} min, stale after ${STALE_HOURS}h`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { start, runRefreshJob };
