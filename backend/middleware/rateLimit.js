const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX = 60;

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0].trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
};

const createRateLimiter = ({
  windowMs = DEFAULT_WINDOW_MS,
  max = DEFAULT_MAX,
  keyGenerator,
  message = "Too many requests. Please try again later.",
  skip,
} = {}) => {
  const buckets = new Map();

  return (req, res, next) => {
    if (typeof skip === "function" && skip(req)) {
      return next();
    }

    const key =
      typeof keyGenerator === "function"
        ? keyGenerator(req)
        : getClientIp(req);
    const now = Date.now();

    const entry = buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ success: false, message });
    }

    entry.count += 1;
    buckets.set(key, entry);
    next();
  };
};

module.exports = { createRateLimiter, getClientIp };
