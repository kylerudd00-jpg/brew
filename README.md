# Local Beer Intelligence

> Find the top-rated craft beers near any ZIP code — with live tap lists and upcoming events.

## Quick Start (no API keys needed)

```bash
git clone <repo>
cd beer-intel
npm install
npm start
# open http://localhost:3000
```

The app runs in **mock mode** automatically when `GOOGLE_API_KEY` is missing — full UI works with realistic Bay Area brewery data.

---

## Setup (live mode)

```bash
cp .env.example .env
# edit .env with your keys
npm start
```

### API Keys Needed

| Key | Where to get | Free tier |
|-----|-------------|-----------|
| `GOOGLE_API_KEY` | Google Cloud Console → Enable *Geocoding API* + *Places API* | $200/mo credit |
| `EVENTBRITE_TOKEN` | eventbrite.com → Account → Developer Links → API Keys | Free |

---

## API Reference

### `GET /search?zip=XXXXX`

Returns top 5 scored beers + all nearby events.

```json
{
  "zip": "94102",
  "topBeers": [
    {
      "name": "Denogginizer Double IPA",
      "style": "Double IPA",
      "abv": 9.75,
      "rating": 4.61,
      "reviewCount": 4872,
      "breweryName": "Drake's Brewing Company",
      "breweryAddress": "1933 Davis St, San Leandro, CA",
      "distanceMiles": 5.4,
      "breweryWebsite": "https://drinkdrakes.com",
      "score": 0.8821,
      "events": [...]
    }
  ],
  "allEvents": [...],
  "meta": {
    "breweryCount": 5,
    "beerCount": 25,
    "radiusMiles": 15,
    "cachedAt": "2026-04-14T00:00:00.000Z",
    "fromCache": false
  }
}
```

### `GET /breweries?zip=XXXXX`

Lightweight — returns brewery list only, no beer scoring.

### `GET /health`

Returns `{ status: "ok", mode: "live"|"mock", uptime: N }`.

---

## Scoring Formula

```
score = (rating / 5.0)                              × 0.50   ← quality
      + log(reviewCount+1) / log(maxReviews+1)       × 0.30   ← popularity
      + (1 - distance / maxDistance)                 × 0.20   ← proximity
```

Scores are normalized 0–1. Log-normalization prevents viral beers from totally dominating.

---

## Architecture

```
GET /search?zip=
  → geocoder.js      ZIP → lat/lng  (cached 30 days)
  → places.js        lat/lng → breweries  (Google Places, max 20)
  → [parallel]
      scraper.js     brewery website → tap list + events  (cheerio)
      eventbrite.js  lat/lng → beer events  (Eventbrite API)
  → ratings.js       beer names → simulated ratings
  → beerScorer.js    rank all beers → top 5
  → cache.js         response cached 1 hour
```

---

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `GOOGLE_API_KEY` | — | Google Geocoding + Places |
| `EVENTBRITE_TOKEN` | — | Eventbrite private token |
| `SEARCH_RADIUS_MILES` | `15` | Brewery search radius |
| `CACHE_TTL_SECONDS` | `3600` | Result cache lifetime |
| `RATE_LIMIT_MAX` | `20` | Requests per window per IP |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |

---

## Upgrading beyond MVP

| Current | Upgrade path |
|---------|-------------|
| Simulated ratings | Untappd API (apply at untappd.com/api/docs) |
| In-memory cache | Redis via `ioredis` |
| Cheerio scraping | Puppeteer for JS-rendered pages |
| In-memory rate limit | Redis rate limiter for multi-instance |
| No persistence | Postgres to cache brewery/beer data |
