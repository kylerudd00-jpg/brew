require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const path     = require('path');

const { rateLimit }     = require('./middleware/rateLimit');
const searchRouter      = require('./routes/search');
const breweriesRouter   = require('./routes/breweries');
const breweryRouter     = require('./routes/brewery');
const beerRouter        = require('./routes/beer');
const trendingRouter    = require('./routes/trending');
const favoritesRouter   = require('./routes/favorites');
const adminRouter       = require('./routes/admin');
const refresher         = require('./jobs/refresher');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const { getStats } = require('./db');
  const mode = process.env.GOOGLE_API_KEY ? 'google+scrape' : 'openbrewerydb+scrape';
  res.json({
    status:  'ok',
    mode,
    uptime:  Math.round(process.uptime()),
    db:      getStats().counts,
  });
});

app.use('/search',     rateLimit, searchRouter);
app.use('/breweries',  rateLimit, breweriesRouter);
app.use('/brewery',    rateLimit, breweryRouter);
app.use('/beer',       rateLimit, beerRouter);
app.use('/trending',   rateLimit, trendingRouter);
app.use('/favorites',  rateLimit, favoritesRouter);
app.use('/admin',      adminRouter);                // auth via x-admin-key header

// Catch-all → SPA
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Error handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const status  = err.status || 500;
  const message = status < 500 ? err.message : 'Internal server error';
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: message });
});

// ── Start (local only — Vercel imports the app directly) ─────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    const mode = process.env.GOOGLE_API_KEY ? 'LIVE (Google + Scrape)' : 'LIVE (Open Brewery DB + Scrape — no API keys needed)';
    console.log(`\nBeer Intel API — ${mode}`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /search?zip=94102`);
    console.log(`  GET  /search?zip=94102&style=IPA&minRating=4.0&sort=rating&limit=10&page=2`);
    console.log(`  GET  /breweries?zip=94102`);
    console.log(`  GET  /brewery/:id`);
    console.log(`  GET  /brewery/:id/refresh`);
    console.log(`  GET  /beer/:id`);
    console.log(`  GET  /trending`);
    console.log(`  GET  /trending?style=IPA&minRating=4.2`);
    console.log(`  GET  /trending/styles`);
    console.log(`  GET  /favorites/:sessionId`);
    console.log(`  POST /favorites/:sessionId         { beerId, name, ... }`);
    console.log(`  DEL  /favorites/:sessionId/:beerId`);
    console.log(`  GET  /admin/stats`);
    console.log(`  GET  /admin/analytics`);
    console.log(`  POST /admin/cache/clear`);
    console.log(`  POST /admin/db/vacuum`);
    console.log(`  GET  /admin/db/beers`);
    console.log(`  GET  /admin/db/searches`);
    console.log('');

    if (process.env.GOOGLE_API_KEY) {
      refresher.start();
    }
  });
}

// Vercel imports this module and calls the app as a handler
module.exports = app;
