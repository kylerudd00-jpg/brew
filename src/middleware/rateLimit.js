/**
 * Simple in-memory rate limiter — no Redis needed for MVP.
 * Allows MAX_REQUESTS per WINDOW_MS per IP.
 * Uses a sliding window with automatic cleanup to prevent memory leaks.
 */

const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '20', 10);
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 min

const store = new Map(); // ip → [timestamps]

// Purge stale IPs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of store.entries()) {
    const valid = timestamps.filter((t) => now - t < WINDOW_MS);
    if (valid.length === 0) store.delete(ip);
    else store.set(ip, valid);
  }
}, 5 * 60 * 1000).unref();

function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const timestamps = (store.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  store.set(ip, timestamps);

  if (timestamps.length > MAX_REQUESTS) {
    const retryAfter = Math.ceil(WINDOW_MS / 1000);
    res.set('Retry-After', retryAfter);
    return res.status(429).json({
      error: `Too many requests. Limit: ${MAX_REQUESTS} per ${retryAfter}s. Try again shortly.`,
    });
  }

  // Expose rate limit headers
  res.set('X-RateLimit-Limit', MAX_REQUESTS);
  res.set('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - timestamps.length));
  next();
}

module.exports = { rateLimit };
