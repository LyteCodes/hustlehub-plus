const { rateLimit } = require("express-rate-limit");
const logger = require("../lib/logger");

const fromEnv = (name, fallback) =>
  Number.parseInt(process.env[name], 10) || fallback;
const WINDOW_MS = fromEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);

function rateLimitHandler(limiterName) {
  return (req, res, next, options) => {
    logger.warn("Rate limit exceeded", {
      event:       "security.rate_limited",
      limiter:     limiterName,
      ip:          req.ip,
      method:      req.method,
      path:        req.path,
      userId:      req.user?.id ?? null,
    });
    res.status(options.statusCode).json(options.message);
  };
}

const bookingRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: fromEnv("BOOKING_RATE_LIMIT", 10),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitHandler("booking"),
  message: {
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many booking requests. Please try again later.",
    },
  },
});

const authRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: fromEnv("AUTH_RATE_LIMIT", 10),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitHandler("auth"),
  message: {
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many auth requests. Please try again later.",
    },
  },
});

const globalRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: fromEnv("GLOBAL_RATE_LIMIT", 300),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitHandler("global"),
  message: {
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again later.",
    },
  },
});

module.exports = {
  authRateLimiter,
  bookingRateLimiter,
  globalRateLimiter
};
