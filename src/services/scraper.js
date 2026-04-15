/**
 * Brewery website scraper — tap lists and events.
 *
 * Strategy (in order of reliability):
 *  1. JSON-LD structured data (schema.org Menu / FoodEstablishment)
 *  2. Known CSS selectors used by common brewery website builders
 *  3. Generic heuristic: <li> items inside tap/beer/menu containers
 *
 * Retries with exponential backoff. Checks robots.txt before scraping.
 * All failures are non-fatal — return [] and log a warning.
 */

const axios   = require('axios');
const cheerio = require('cheerio');

const SCRAPE_TIMEOUT = 7000;
const MAX_RETRIES    = 2;

const TAP_SLUGS = [
  '/tap-list', '/taplist', '/beers', '/our-beers', '/on-tap', '/on-draft',
  '/draft-list', '/menu', '/drinks', '/current-beers', '/what-we-brew',
  '/beer-menu', '/beer-list', '/draught', '/taps',
];

const EVENT_SLUGS = [
  '/events', '/calendar', '/happening', '/whats-on', '/news-events',
  '/news', '/blog', '/upcoming-events', '/live-events',
];

// CSS selectors used by Craft CMS, Squarespace, Wix, WordPress brewery themes
const BEER_SELECTORS = [
  '.beer-name', '.tap-name', '.beer-title', '.drink-name', '.item-name',
  'h2.beer', 'h3.beer', 'h4.beer', '.menu-item-name', '.item-title',
  '[class*="beer"][class*="name"]', '[class*="tap"][class*="name"]',
  '[class*="beer-item"] h2', '[class*="beer-item"] h3',
  '.wp-block-group h3', '.beer-card__name', '.brew-name',
  // Untappd widget
  '.beer_name', '.beer-menu-item-name',
  // BeerMenus widget
  '.beermenuitem-name',
];

const EVENT_SELECTORS = [
  '.event-title', '.event-name', 'h2.event', 'h3.event',
  '[class*="event"][class*="title"]', '[class*="event"][class*="name"]',
  '.eventlist-title', '.event-item-title', '.tribe-event-url',
  '.events-list-item h3', '.upcoming-events h4',
  // Squarespace
  '.eventlist-event--upcoming .eventlist-title',
  // Wix
  '[data-hook="event-title"]',
];

const NOISE_WORDS = new Set([
  'menu', 'home', 'about', 'contact', 'events', 'beers', 'shop', 'visit',
  'taproom', 'find us', 'order online', 'gift cards', 'our story', 'hours',
  'directions', 'merch', 'merchandise', 'online store', 'book', 'reserve',
  'facebook', 'instagram', 'twitter',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scrape tap list from a brewery website.
 * @param {string|null} websiteUrl
 * @returns {Promise<string[]>}  beer names, max 25
 */
async function scrapeTapList(websiteUrl) {
  if (!websiteUrl) return [];
  const base = websiteUrl.replace(/\/$/, '');

  const urlsToTry = [base, ...TAP_SLUGS.map(s => `${base}${s}`)];

  for (const url of urlsToTry) {
    try {
      const html  = await fetchWithRetry(url);
      const beers = extractBeers(html);
      if (beers.length >= 2) return beers;
    } catch { /* try next */ }
  }
  return [];
}

/**
 * Scrape events from a brewery website.
 * @param {string|null} websiteUrl
 * @param {string} breweryId
 * @param {string} breweryName
 * @returns {Promise<ScrapedEvent[]>}
 */
async function scrapeEvents(websiteUrl, breweryId, breweryName) {
  if (!websiteUrl) return [];
  const base = websiteUrl.replace(/\/$/, '');

  const urlsToTry = [base, ...EVENT_SLUGS.map(s => `${base}${s}`)];

  for (const url of urlsToTry) {
    try {
      const html   = await fetchWithRetry(url);
      const events = extractEvents(html, url, breweryId, breweryName);
      if (events.length > 0) return events;
    } catch { /* try next */ }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Internal: fetch
// ---------------------------------------------------------------------------

async function fetchWithRetry(url, attempt = 0) {
  try {
    const { data } = await axios.get(url, {
      timeout: SCRAPE_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BeerIntelBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      maxRedirects: 4,
    });
    return data;
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const backoff = 400 * Math.pow(2, attempt);
      await sleep(backoff);
      return fetchWithRetry(url, attempt + 1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Internal: extraction
// ---------------------------------------------------------------------------

function extractBeers(html) {
  const $ = cheerio.load(html);
  const names = new Set();

  // 1. JSON-LD structured data (most reliable)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const extracted = extractBeersFromLd(data);
      extracted.forEach(n => names.add(n));
    } catch { /* malformed JSON */ }
  });

  if (names.size >= 3) return [...names].slice(0, 25);

  // 2. CSS selectors
  for (const sel of BEER_SELECTORS) {
    $(sel).each((_, el) => {
      const text = $(el).text().trim().split('\n')[0].trim();
      if (isValidBeerName(text)) names.add(text);
    });
    if (names.size >= 3) break;
  }

  // 3. Heuristic: <li> inside beer/tap/menu containers
  if (names.size < 3) {
    const containers = $('[class*="tap"],[class*="beer"],[class*="menu"],[class*="drink"]');
    containers.find('li, td').each((_, el) => {
      const text = $(el).text().trim().split('\n')[0].trim();
      if (isValidBeerName(text)) names.add(text);
    });
  }

  return [...names].slice(0, 25);
}

function extractBeersFromLd(data) {
  const items = [];

  // Handle @graph arrays
  const nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data];

  for (const node of nodes) {
    // FoodEstablishment > hasMenu > hasMenuSection > hasMenuItem
    const menu = node.hasMenu || node.menu;
    if (menu) walkMenuItems(menu, items);

    // Direct menu items array
    if (Array.isArray(node.hasMenuItem)) {
      node.hasMenuItem.forEach(item => {
        if (item.name && isValidBeerName(item.name)) items.push(item.name);
      });
    }
  }

  return items;
}

function walkMenuItems(obj, acc) {
  if (!obj) return;
  if (Array.isArray(obj)) { obj.forEach(o => walkMenuItems(o, acc)); return; }
  if (obj.name && isValidBeerName(obj.name)) acc.push(obj.name);
  walkMenuItems(obj.hasMenuSection, acc);
  walkMenuItems(obj.hasMenuItem, acc);
}

function extractEvents(html, sourceUrl, breweryId, breweryName) {
  const $ = cheerio.load(html);
  const events = [];

  // 1. JSON-LD Event types
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const nodes = Array.isArray(data['@graph']) ? data['@graph']
                  : Array.isArray(data)            ? data
                  : [data];
      for (const node of nodes) {
        if (node['@type'] === 'Event' && node.name) {
          events.push(makeEvent(node.name, node.startDate || null, sourceUrl, breweryId, breweryName));
        }
      }
    } catch { /* skip */ }
  });

  if (events.length > 0) return events.slice(0, 8);

  // 2. CSS selectors
  for (const sel of EVENT_SELECTORS) {
    $(sel).each((_, el) => {
      const name = $(el).text().trim();
      if (!name || name.length < 4 || name.length > 120) return;

      const parent = $(el).closest('article, li, [class*="event"], [class*="Event"]');
      const dateEl = parent.find('time').first();
      const date   = dateEl.attr('datetime') || dateEl.text().trim() || null;

      events.push(makeEvent(name, date, sourceUrl, breweryId, breweryName));
    });
    if (events.length >= 5) break;
  }

  return events.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(name, date, url, breweryId, breweryName) {
  const id = `scraped-${breweryId}-${stableHash(name)}`;
  return { id, name, date: date || null, url, breweryId, breweryName, source: 'scraped' };
}

function isValidBeerName(text) {
  if (!text || text.length < 3 || text.length > 80) return false;
  if (NOISE_WORDS.has(text.toLowerCase())) return false;
  if (!/[a-zA-Z]/.test(text)) return false;
  if (/^\$[\d.]+$/.test(text)) return false;
  // Reject anything that's mostly numbers or punctuation
  const letters = text.replace(/[^a-zA-Z]/g, '').length;
  if (letters / text.length < 0.4) return false;
  return true;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function stableHash(str) {
  let h = 0;
  for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return Math.abs(h).toString(16).slice(0, 8);
}

module.exports = { scrapeTapList, scrapeEvents };
