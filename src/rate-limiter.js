/**
 * Rate Limiter Middleware
 * 
 * Redis-based rate limiting for API protection.
 * Implements sliding window algorithm for accurate limiting.
 * 
 * @module rate-limiter
 */

const { checkRateLimit } = require('./redis');

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT LIMITS
// ═══════════════════════════════════════════════════════════════════════════

const LIMITS = {
    default: { requests: 10, windowSeconds: 1 },      // 10 req/sec
    strict: { requests: 5, windowSeconds: 1 },        // 5 req/sec (postbacks)
    relaxed: { requests: 30, windowSeconds: 1 },      // 30 req/sec (static)
    auth: { requests: 5, windowSeconds: 60 },         // 5 req/min (login)
    withdraw: { requests: 2, windowSeconds: 60 }      // 2 req/min (withdrawals)
};

// ═══════════════════════════════════════════════════════════════════════════
// IP EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract client IP address (handles proxies)
 * @param {Request} req - Express request
 * @returns {string} Client IP
 */
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.headers['x-real-ip']
        || req.socket?.remoteAddress
        || req.ip
        || 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create rate limiter middleware
 * @param {string|Object} options - Limit preset name or custom { requests, windowSeconds }
 * @returns {Function} Express middleware
 */
function rateLimit(options = 'default') {
    // Parse options
    let limit, windowSeconds;

    if (typeof options === 'string') {
        const preset = LIMITS[options] || LIMITS.default;
        limit = preset.requests;
        windowSeconds = preset.windowSeconds;
    } else {
        limit = options.requests || 10;
        windowSeconds = options.windowSeconds || 1;
    }

    return async (req, res, next) => {
        const ip = getClientIP(req);

        // Skip rate limiting for localhost in development
        if (process.env.NODE_ENV !== 'production' && ip === '::1') {
            return next();
        }

        const result = await checkRateLimit(ip, limit, windowSeconds);

        // Set rate limit headers
        res.set({
            'X-RateLimit-Limit': limit,
            'X-RateLimit-Remaining': Math.max(0, result.remaining),
            'X-RateLimit-Reset': result.resetIn
        });

        if (!result.allowed) {
            console.log(`⚠️  Rate limited: ${ip} (${req.path})`);
            return res.status(429).json({
                success: false,
                error: 'Too many requests. Please slow down.',
                retryAfter: result.resetIn
            });
        }

        next();
    };
}

/**
 * Strict rate limiter for sensitive endpoints
 */
const strictRateLimit = rateLimit('strict');

/**
 * Auth rate limiter (prevents brute force)
 */
const authRateLimit = rateLimit('auth');

/**
 * Withdrawal rate limiter
 */
const withdrawRateLimit = rateLimit('withdraw');

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    rateLimit,
    strictRateLimit,
    authRateLimit,
    withdrawRateLimit,
    getClientIP,
    LIMITS
};
