/**
 * Favorites — session-based saved beers.
 *
 * Sessions are client-managed: the client generates a UUID and passes it
 * as the URL segment. No authentication is needed — this is purely
 * opt-in persistence, not private data.
 *
 * GET    /favorites/:sessionId          — list saved beers
 * POST   /favorites/:sessionId          — save a beer  { beerId, name, breweryId, ... }
 * DELETE /favorites/:sessionId/:beerId  — remove one beer
 * DELETE /favorites/:sessionId          — clear all
 */

const express = require('express');
const db      = require('../db');

const router = express.Router();

// ── Validate session ID ───────────────────────────────────────────────────────
const SESSION_RE = /^[a-zA-Z0-9_\-]{8,64}$/;
function validSession(id) { return SESSION_RE.test(id); }

// ── GET /favorites/:sessionId ─────────────────────────────────────────────────
router.get('/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!validSession(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

  const favs = db.getFavorites(sessionId);
  return res.json({
    sessionId,
    count: favs.length,
    favorites: favs.map(f => ({
      beerId:      f.beer_id,
      name:        f.beer_name,
      breweryId:   f.brewery_id,
      breweryName: f.brewery_name,
      style:       f.style,
      rating:      f.rating,
      abv:         f.abv,
      savedAt:     new Date(f.saved_at * 1000).toISOString(),
    })),
  });
});

// ── POST /favorites/:sessionId ────────────────────────────────────────────────
router.post('/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!validSession(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

  const { beerId, name, breweryId, breweryName, style, rating, abv } = req.body || {};
  if (!beerId || !name) {
    return res.status(400).json({ error: 'beerId and name are required' });
  }
  if (typeof beerId !== 'string' || beerId.length > 100) {
    return res.status(400).json({ error: 'invalid beerId' });
  }

  db.saveFavorite(sessionId, { id: beerId, name, breweryId, breweryName, style, rating, abv });
  return res.status(201).json({ saved: true, beerId });
});

// ── DELETE /favorites/:sessionId/:beerId ──────────────────────────────────────
router.delete('/:sessionId/:beerId', (req, res) => {
  const { sessionId, beerId } = req.params;
  if (!validSession(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

  const removed = db.deleteFavorite(sessionId, beerId);
  return res.json({ removed });
});

// ── DELETE /favorites/:sessionId (clear all) ──────────────────────────────────
router.delete('/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!validSession(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

  const count = db.clearFavorites(sessionId);
  return res.json({ cleared: count });
});

module.exports = router;
