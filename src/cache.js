const NodeCache = require('node-cache');

// Single shared cache instance — TTL set from env, default 1 hour
const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL_SECONDS || '3600', 10),
  checkperiod: 120,
});

module.exports = cache;
