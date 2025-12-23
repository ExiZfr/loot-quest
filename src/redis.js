/**
 * Redis Client - High Performance Cache & Lock Manager
 * 
 * Provides:
 * - Connection pooling with auto-reconnect
 * - Cache operations with TTL
 * - Rate limiting per IP
 * - Distributed locks (Mutex) for critical operations
 * 
 * @module redis
 */

const Redis = require('ioredis');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const CACHE_PREFIX = 'lq:cache:';
const RATE_PREFIX = 'lq:rate:';
const LOCK_PREFIX = 'lq:lock:';

// ═══════════════════════════════════════════════════════════════════════════
// REDIS CLIENT SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

let redis = null;

/**
 * Get Redis client instance (lazy initialization)
 * @returns {Redis} Redis client
 */
function getClient() {
    if (!redis) {
        redis = new Redis(REDIS_URL, {
            maxRetriesPerRequest: 3,
            retryDelayOnFailover: 100,
            lazyConnect: true,
            showFriendlyErrorStack: process.env.NODE_ENV !== 'production'
        });

        redis.on('connect', () => console.log('🔴 Redis connected'));
        redis.on('error', (err) => console.error('Redis error:', err.message));
        redis.on('reconnecting', () => console.log('🔴 Redis reconnecting...'));
    }
    return redis;
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set cache value with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache (will be JSON stringified)
 * @param {number} ttlSeconds - Time to live in seconds (default: 5 minutes)
 */
async function setCache(key, value, ttlSeconds = 300) {
    try {
        const client = getClient();
        await client.setex(CACHE_PREFIX + key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
        console.error('Redis setCache error:', err.message);
    }
}

/**
 * Get cached value
 * @param {string} key - Cache key
 * @returns {any|null} Cached value or null
 */
async function getCache(key) {
    try {
        const client = getClient();
        const data = await client.get(CACHE_PREFIX + key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        console.error('Redis getCache error:', err.message);
        return null;
    }
}

/**
 * Delete cached value
 * @param {string} key - Cache key
 */
async function delCache(key) {
    try {
        const client = getClient();
        await client.del(CACHE_PREFIX + key);
    } catch (err) {
        console.error('Redis delCache error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING (Sliding Window)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if request is rate limited
 * @param {string} identifier - Usually IP address
 * @param {number} limit - Max requests per window (default: 10)
 * @param {number} windowSeconds - Window size in seconds (default: 1)
 * @returns {Object} { allowed: boolean, remaining: number, resetIn: number }
 */
async function checkRateLimit(identifier, limit = 10, windowSeconds = 1) {
    try {
        const client = getClient();
        const key = RATE_PREFIX + identifier;
        const now = Date.now();
        const windowMs = windowSeconds * 1000;
        const windowStart = now - windowMs;

        // Use Redis transaction for atomic operation
        const multi = client.multi();
        multi.zremrangebyscore(key, 0, windowStart); // Remove old entries
        multi.zadd(key, now, `${now}`); // Add current request
        multi.zcard(key); // Count requests in window
        multi.pexpire(key, windowMs); // Set expiry

        const results = await multi.exec();
        const requestCount = results[2][1];

        if (requestCount > limit) {
            return {
                allowed: false,
                remaining: 0,
                resetIn: windowSeconds
            };
        }

        return {
            allowed: true,
            remaining: limit - requestCount,
            resetIn: windowSeconds
        };
    } catch (err) {
        console.error('Redis rateLimit error:', err.message);
        // Fail open - allow request if Redis is down
        return { allowed: true, remaining: limit, resetIn: 0 };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DISTRIBUTED LOCKS (Redlock-like)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Acquire a distributed lock
 * @param {string} resource - Resource identifier (e.g., "withdraw:userId")
 * @param {number} ttlMs - Lock timeout in milliseconds (default: 10 seconds)
 * @returns {string|null} Lock token if acquired, null if failed
 */
async function acquireLock(resource, ttlMs = 10000) {
    try {
        const client = getClient();
        const key = LOCK_PREFIX + resource;
        const token = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // SET NX EX - Only set if not exists
        const result = await client.set(key, token, 'PX', ttlMs, 'NX');

        if (result === 'OK') {
            return token;
        }
        return null; // Lock already held
    } catch (err) {
        console.error('Redis acquireLock error:', err.message);
        return null;
    }
}

/**
 * Release a distributed lock
 * @param {string} resource - Resource identifier
 * @param {string} token - Lock token from acquireLock
 * @returns {boolean} true if released, false if lock was already released or expired
 */
async function releaseLock(resource, token) {
    try {
        const client = getClient();
        const key = LOCK_PREFIX + resource;

        // Lua script for atomic check-and-delete
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;

        const result = await client.eval(script, 1, key, token);
        return result === 1;
    } catch (err) {
        console.error('Redis releaseLock error:', err.message);
        return false;
    }
}

/**
 * Execute function with distributed lock
 * @param {string} resource - Resource to lock
 * @param {Function} fn - Async function to execute
 * @param {number} ttlMs - Lock timeout
 * @returns {any} Function result or throws if lock not acquired
 */
async function withLock(resource, fn, ttlMs = 10000) {
    const token = await acquireLock(resource, ttlMs);

    if (!token) {
        const error = new Error('Failed to acquire lock');
        error.code = 'LOCK_FAILED';
        throw error;
    }

    try {
        return await fn();
    } finally {
        await releaseLock(resource, token);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check Redis connection health
 * @returns {boolean} true if connected
 */
async function isHealthy() {
    try {
        const client = getClient();
        const pong = await client.ping();
        return pong === 'PONG';
    } catch {
        return false;
    }
}

/**
 * Graceful shutdown
 */
async function disconnect() {
    if (redis) {
        await redis.quit();
        redis = null;
        console.log('🔴 Redis disconnected');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    getClient,
    setCache,
    getCache,
    delCache,
    checkRateLimit,
    acquireLock,
    releaseLock,
    withLock,
    isHealthy,
    disconnect
};
