/**
 * PixelRewards - Main Server
 * 
 * Express server for the PixelRewards GPT (Get-Paid-To) platform.
 * Handles user authentication, Lootably postbacks, and reward withdrawals.
 * 
 * @architecture
 * - SQLite database (sql.js - pure JavaScript) for persistent storage
 * - Firebase Admin SDK for JWT validation
 * - Server-side reward price validation
 * - 7-day retention rule for first withdrawal
 * 
 * @routes
 * POST   /api/user/login         - Validate Firebase JWT & sync user
 * GET    /api/user/balance       - Get user balance and stats
 * GET    /api/user/transactions  - Get transaction history
 * GET    /api/postback/lootably  - Handle Lootably postback (server-to-server)
 * GET    /api/rewards            - Get rewards catalog
 * POST   /api/withdraw           - Request reward withdrawal
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const admin = require('firebase-admin');
const geoip = require('geoip-lite');
const requestIp = require('request-ip');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// High-Performance Modules
const redis = require('./src/redis');
const { rateLimit, strictRateLimit, authRateLimit, withdrawRateLimit } = require('./src/rate-limiter');
const { createSessionMiddleware, isAuthenticated, optionalAuth, createUserSession, destroySession } = require('./src/auth');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
const LOOTABLY_SECRET = process.env.LOOTABLY_SECRET || 'your_lootably_secret_key';
const LOOTABLY_IP_WHITELIST = process.env.LOOTABLY_IP_WHITELIST
    ? process.env.LOOTABLY_IP_WHITELIST.split(',').map(ip => ip.trim())
    : [];
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const SIGNUP_BONUS = 50; // Welcome bonus points
const JWT_SECRET = process.env.JWT_SECRET || 'lootquest_secret_key_change_in_production';
const JWT_EXPIRES_IN = '7d'; // Token expiration
const SALT_ROUNDS = 10; // bcrypt salt rounds

// Economy Configuration (60/40 Split)
const POINTS_PER_DOLLAR = 1000; // 1000 points = $1.00
const USER_SPLIT = 0.60; // User receives 60% of offer value
const PLATFORM_SPLIT = 0.40; // Platform keeps 40%

// ═══════════════════════════════════════════════════════════════════════════
// REFERRAL SYSTEM CONFIGURATION (Anti-Fraud & Performance-Based)
// ═══════════════════════════════════════════════════════════════════════════
const REFERRAL_BONUS = 50; // Points given to referrer when unlock threshold is met
const REFERRAL_THRESHOLD = 500; // Referred user must earn this many points to unlock bonus
const REFERRAL_COMMISSION_RATE = 0.05; // 5% lifetime commission on referred user earnings

// Discord Webhook for Support Notifications
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';


// ═══════════════════════════════════════════════════════════════════════════
// DATABASE WRAPPER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class Database {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, 'data', 'pixelrewards.db');
    }

    async init() {
        const SQL = await initSqlJs();

        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Load existing database or create new one
        if (fs.existsSync(this.dbPath)) {
            const buffer = fs.readFileSync(this.dbPath);
            this.db = new SQL.Database(buffer);
            console.log('📂 Loaded existing database');
        } else {
            this.db = new SQL.Database();
            console.log('✨ Created new database');
            this.initSchema();
        }

        // ═══════════════════════════════════════════════════════════════
        // HIGH-PERFORMANCE SQLite Configuration
        // ═══════════════════════════════════════════════════════════════
        this.db.run('PRAGMA foreign_keys = ON');
        this.db.run('PRAGMA journal_mode = WAL');        // Write-Ahead Logging for concurrency
        this.db.run('PRAGMA synchronous = NORMAL');      // Faster writes, still safe
        this.db.run('PRAGMA cache_size = -64000');       // 64MB cache
        this.db.run('PRAGMA temp_store = MEMORY');       // Temp tables in RAM
        this.db.run('PRAGMA mmap_size = 268435456');     // 256MB memory-mapped I/O
        console.log('⚡ SQLite WAL mode enabled (high-performance)');
    }

    initSchema() {
        // Create tables if they don't exist
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                display_name TEXT,
                avatar_url TEXT,
                provider TEXT DEFAULT 'email',
                firebase_uid TEXT,
                discord_id TEXT,
                discord_username TEXT,
                discord_avatar TEXT,
                balance INTEGER DEFAULT 0 CHECK(balance >= 0),
                total_earned INTEGER DEFAULT 0,
                total_withdrawn INTEGER DEFAULT 0,
                role TEXT DEFAULT 'user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                first_withdrawal_at DATETIME,
                last_login_at DATETIME
            )
        `);

        // Add columns if they don't exist (for existing databases)
        try { this.db.run('ALTER TABLE users ADD COLUMN firebase_uid TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN discord_id TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN discord_username TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN discord_avatar TEXT'); } catch (e) { }

        // Referral System Columns (Anti-Fraud)
        try { this.db.run('ALTER TABLE users ADD COLUMN referral_code TEXT UNIQUE'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN referred_by_user_id TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN ip_address TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN lifetime_earnings INTEGER DEFAULT 0'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN referral_unlocked INTEGER DEFAULT 0'); } catch (e) { }
        try { this.db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'"); } catch (e) { }

        // Admin Panel & Fraud Detection Columns
        try { this.db.run('ALTER TABLE users ADD COLUMN user_agent TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN last_activity_at DATETIME'); } catch (e) { }

        // Personal Info for Withdrawals (KYC)
        try { this.db.run('ALTER TABLE users ADD COLUMN first_name TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN last_name TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN address TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN city TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN postal_code TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN country TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE users ADD COLUMN personal_info_completed INTEGER DEFAULT 0'); } catch (e) { }

        this.db.run('CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)');

        this.db.run(`
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                amount INTEGER NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('credit', 'debit')),
                source TEXT NOT NULL,
                offer_name TEXT,
                description TEXT,
                ip_address TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        this.db.run(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                reward_id TEXT NOT NULL,
                reward_name TEXT NOT NULL,
                points_spent INTEGER NOT NULL,
                delivery_info TEXT,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'cancelled', 'failed')),
                admin_notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                processed_at DATETIME,
                completed_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Create indexes
        this.db.run('CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');

        // Withdrawals fraud tracking columns
        try { this.db.run('ALTER TABLE withdrawals ADD COLUMN request_ip TEXT'); } catch (e) { }
        try { this.db.run('ALTER TABLE withdrawals ADD COLUMN request_user_agent TEXT'); } catch (e) { }

        // Support tickets table (for bug reports & contact forms)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS support_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL CHECK(type IN ('bug', 'contact')),
                email TEXT,
                subject TEXT NOT NULL,
                content TEXT NOT NULL,
                user_id TEXT,
                browser_info TEXT,
                page_url TEXT,
                status TEXT DEFAULT 'new' CHECK(status IN ('new', 'in_progress', 'resolved', 'closed')),
                admin_notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                resolved_at DATETIME
            )
        `);
        this.db.run('CREATE INDEX IF NOT EXISTS idx_support_tickets_type ON support_tickets(type)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)');

        // ═══════════════════════════════════════════════════════════════
        // SEO ANALYTICS TABLE
        // Native analytics tracking without Google Analytics
        // ═══════════════════════════════════════════════════════════════
        this.db.run(`
            CREATE TABLE IF NOT EXISTS analytics_visits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_url TEXT NOT NULL,
                blog_slug TEXT,
                visitor_ip_hash TEXT NOT NULL,
                user_agent TEXT,
                device_type TEXT CHECK(device_type IN ('mobile', 'desktop', 'tablet', 'bot')),
                referer TEXT,
                referer_category TEXT CHECK(referer_category IN ('direct', 'google', 'social', 'other')),
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Performance indexes for analytics queries
        this.db.run('CREATE INDEX IF NOT EXISTS idx_analytics_page_url ON analytics_visits(page_url)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics_visits(timestamp)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_analytics_blog_slug ON analytics_visits(blog_slug)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_analytics_device_type ON analytics_visits(device_type)');

        this.save();
    }

    // Execute SQL that returns no result
    run(sql, params = []) {
        this.db.run(sql, params);
        this.save();
    }

    // Get single row
    get(sql, params = []) {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
        }
        stmt.free();
        return null;
    }

    // Get all rows
    all(sql, params = []) {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
    }

    // Save database to file
    save() {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
    }

    // Close database
    close() {
        if (this.db) {
            this.save();
            this.db.close();
        }
    }
}

// Global database instance
const db = new Database();

// ═══════════════════════════════════════════════════════════════════════════
// FIREBASE ADMIN SDK INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

let firebaseInitialized = false;

function initFirebase() {
    try {
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';

        if (fs.existsSync(serviceAccountPath)) {
            const serviceAccount = require(serviceAccountPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            firebaseInitialized = true;
            console.log('🔥 Firebase Admin SDK initialized');
        } else {
            console.warn('⚠️  Firebase service account not found. Authentication will fail.');
            console.warn(`   Expected path: ${serviceAccountPath}`);
            console.warn('   Download from: Firebase Console > Project Settings > Service Accounts');
        }
    } catch (error) {
        console.error('❌ Failed to initialize Firebase:', error.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// REWARDS CATALOG MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

let rewardsCatalog = { brands: [] };
let flatRewardsMap = new Map(); // For O(1) lookup by denomination ID

function loadRewards() {
    try {
        const rewardsPath = path.join(__dirname, 'content', 'rewards.json');
        if (fs.existsSync(rewardsPath)) {
            rewardsCatalog = JSON.parse(fs.readFileSync(rewardsPath, 'utf8'));

            // Build flat map for easy lookup
            flatRewardsMap.clear();
            rewardsCatalog.brands.forEach(brand => {
                brand.denominations.forEach(denom => {
                    flatRewardsMap.set(denom.id, {
                        ...denom,
                        brandName: brand.name,
                        brandId: brand.id,
                        category: brand.category,
                        image: brand.image,
                        color: brand.color
                    });
                });
            });

            console.log(`🎁 Loaded ${rewardsCatalog.brands.length} brands with ${flatRewardsMap.size} denominations`);
        } else {
            console.warn('⚠️ rewards.json not found, using empty catalog');
        }
    } catch (error) {
        console.error('Failed to load rewards.json:', error.message);
    }
}

// Initial Load
loadRewards();

/**
 * Get a specific reward denomination by ID
 * @param {string} id - The denomination ID (e.g. 'roblox_100')
 * @returns {object|null} The reward object with denomination details + brand info
 */
function getRewardById(id) {
    return flatRewardsMap.get(id) || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPRESS APP SETUP
// ═══════════════════════════════════════════════════════════════════════════

const app = express();

// Security middleware
app.use(helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://www.gstatic.com", "https://apis.google.com", "https://*.firebaseapp.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick handlers
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseio.com", "https://*.firebaseapp.com", "wss://*.firebaseio.com", "https://lootably.com", "https://unpkg.com", "https://www.gstatic.com"],
            frameSrc: ["'self'", "https://*.firebaseapp.com", "https://lootably.com"],
        },
    },
}));

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Trust Nginx proxy (needed for secure cookies behind reverse proxy)
app.set('trust proxy', 1);

// Redis Session Middleware (Production-Ready)
const isProduction = process.env.NODE_ENV === 'production';
app.use(createSessionMiddleware(isProduction));

// Expose db instance for middleware to use (activity tracking)
app.locals.db = db;

app.use(express.static(path.join(__dirname, 'public')));

// SEO Analytics tracking (non-blocking, runs in background)
app.use(trackVisit);


// ═══════════════════════════════════════════════════════════════════════════
// FIREBASE AUTH HANDLER PROXY
// Proxy Firebase auth endpoints to avoid cross-origin storage partitioning
// ═══════════════════════════════════════════════════════════════════════════

const FIREBASE_PROJECT_ID = 'loot-quest-5fe77';

// Proxy all /__/auth/* requests to Firebase
app.use('/__/auth', async (req, res) => {
    const targetUrl = `https://${FIREBASE_PROJECT_ID}.firebaseapp.com/__/auth${req.url}`;

    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers: {
                ...req.headers,
                host: `${FIREBASE_PROJECT_ID}.firebaseapp.com`
            },
            data: req.body,
            responseType: 'arraybuffer',
            validateStatus: () => true
        });

        // Copy response headers
        Object.entries(response.headers).forEach(([key, value]) => {
            if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
                res.setHeader(key, value);
            }
        });

        res.status(response.status).send(response.data);
    } catch (error) {
        console.error('Firebase auth proxy error:', error.message);
        res.status(502).send('Firebase auth proxy error');
    }
});

// Also proxy Firebase init.json for proper initialization
app.get('/__/firebase/init.json', async (req, res) => {
    try {
        const response = await axios.get(`https://${FIREBASE_PROJECT_ID}.firebaseapp.com/__/firebase/init.json`);
        res.json(response.data);
    } catch (error) {
        console.error('Firebase init.json proxy error:', error.message);
        res.status(502).json({ error: 'Failed to fetch Firebase config' });
    }
});


// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE: i18n Language Detection (GeoIP)
// ═══════════════════════════════════════════════════════════════════════════

// French-speaking countries
const FRENCH_COUNTRIES = ['FR', 'BE', 'CH', 'CA', 'LU', 'MC', 'SN', 'CI', 'MA', 'TN', 'DZ', 'HT', 'MG', 'ML', 'NE', 'BF', 'TD'];

/**
 * Detect user language from IP or cookie
 * Sets a 'lang' cookie if not present
 */
app.use((req, res, next) => {
    // Skip for API requests and static files
    if (req.path.startsWith('/api/') || req.path.includes('.')) {
        return next();
    }

    // Check if user already has a language preference
    let lang = req.cookies?.lang;

    if (!lang) {
        // Detect from IP address
        const ip = requestIp.getClientIp(req);
        const geo = geoip.lookup(ip);

        // Set language based on country
        lang = (geo && FRENCH_COUNTRIES.includes(geo.country)) ? 'fr' : 'en';

        // Set cookie for 1 year
        res.cookie('lang', lang, {
            maxAge: 365 * 24 * 60 * 60 * 1000,
            httpOnly: false, // Allow JS access
            sameSite: 'Lax'
        });

        console.log(`🌍 GeoIP: ${ip} → ${geo?.country || 'Unknown'} → lang=${lang}`);
    }

    // Attach to request for other middleware
    req.lang = lang;
    next();
});

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE: Firebase JWT Verification
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Middleware to verify Firebase JWT token
 * Extracts user info and attaches to req.user
 */
async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Missing or invalid authorization header'
        });
    }

    if (!firebaseInitialized) {
        return res.status(500).json({
            success: false,
            error: 'Firebase not configured on server'
        });
    }

    const token = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            name: decodedToken.name || decodedToken.email?.split('@')[0],
            picture: decodedToken.picture,
            provider: decodedToken.firebase?.sign_in_provider || 'unknown'
        };
        next();
    } catch (error) {
        console.error('Token verification failed:', error.message);
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Get client IP address
// ═══════════════════════════════════════════════════════════════════════════

function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.headers['x-real-ip']
        || req.socket?.remoteAddress
        || 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE: Analytics Tracking (SEO Module)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Track page visits for SEO analytics
 * - Non-blocking (continues request immediately, tracks in background)
 * - GDPR compliant (IPs are hashed with SHA-256)
 * - Detects bots, device types, referer sources
 * - Ignores static files and API calls
 */
function trackVisit(req, res, next) {
    // Continue request immediately (non-blocking)
    next();

    // Exclude static files, API routes, and assets
    if (req.path.includes('.css') ||
        req.path.includes('.js') ||
        req.path.includes('.png') ||
        req.path.includes('.jpg') ||
        req.path.includes('.jpeg') ||
        req.path.includes('.webp') ||
        req.path.includes('.svg') ||
        req.path.includes('.ico') ||
        req.path.includes('/api/')) {
        return;
    }

    // Track asynchronously to avoid blocking
    setImmediate(() => {
        try {
            // Get and hash IP address (GDPR compliant)
            const ip = getClientIP(req);
            const ipHash = crypto.createHash('sha256')
                .update(ip + 'LOOTQUEST_ANALYTICS_SALT')
                .digest('hex');

            // User agent
            const userAgent = req.headers['user-agent'] || '';

            // Bot detection
            const botPatterns = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|whatsapp|telegram/i;
            const isBot = botPatterns.test(userAgent);

            // Device type detection
            const isMobile = /mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
            const isTablet = /ipad|android(?!.*mobile)|tablet/i.test(userAgent);
            let deviceType = 'desktop';
            if (isBot) deviceType = 'bot';
            else if (isTablet) deviceType = 'tablet';
            else if (isMobile) deviceType = 'mobile';

            // Referer analysis
            const referer = req.headers['referer'] || req.headers['referrer'] || '';
            let refererCategory = 'direct';
            if (referer) {
                if (/google\./i.test(referer)) refererCategory = 'google';
                else if (/facebook|twitter|instagram|tiktok|linkedin|reddit|pinterest|youtube/i.test(referer)) refererCategory = 'social';
                else refererCategory = 'other';
            }

            // Extract blog slug from URL
            let blogSlug = null;
            if (req.path.startsWith('/blog/') && req.path.endsWith('.html')) {
                blogSlug = req.path.replace('/blog/', '').replace('.html', '');
            }

            // Insert visit record (async, non-blocking)
            db.run(`
                INSERT INTO analytics_visits (page_url, blog_slug, visitor_ip_hash, user_agent, device_type, referer, referer_category)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [req.path, blogSlug, ipHash, userAgent, deviceType, referer, refererCategory]);

        } catch (error) {
            // Silent fail - don't break user experience for analytics
            console.error('Analytics tracking error:', error.message);
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Generate Unique Referral Code
// ═══════════════════════════════════════════════════════════════════════════

function generateReferralCode(userId) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(userId + Date.now().toString()).digest('hex');
    return `lq-${hash.substring(0, 8)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Generate JWT Token
// ═══════════════════════════════════════════════════════════════════════════

function generateToken(user) {
    return jwt.sign(
        {
            uid: user.id,
            email: user.email,
            provider: user.provider
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE: Verify Our Own JWT (for email/password auth)
// ═══════════════════════════════════════════════════════════════════════════

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Missing or invalid authorization header'
        });
    }

    const token = authHeader.split('Bearer ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
            uid: decoded.uid,
            email: decoded.email,
            provider: decoded.provider
        };
        next();
    } catch (error) {
        console.error('JWT verification failed:', error.message);
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED AUTH MIDDLEWARE (supports both Firebase and our JWT)
// ═══════════════════════════════════════════════════════════════════════════

async function verifyAuth(req, res, next) {
    // ═══════════════════════════════════════════════════════════════
    // PRIORITY 1: Check session authentication (Discord/OAuth users)
    // ═══════════════════════════════════════════════════════════════
    if (req.session && req.session.user && req.session.user.id) {
        req.user = {
            uid: req.session.user.id,
            email: req.session.user.email,
            provider: req.session.user.provider || 'session'
        };
        return next();
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIORITY 2: Check Bearer token (Firebase/JWT users)
    // ═══════════════════════════════════════════════════════════════
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Not authenticated. Please log in.'
        });
    }

    const token = authHeader.split('Bearer ')[1];

    // Try our JWT first
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
            uid: decoded.uid,
            email: decoded.email,
            provider: decoded.provider || 'email'
        };
        return next();
    } catch (jwtError) {
        // If not our JWT, try Firebase
        if (firebaseInitialized) {
            try {
                const decodedToken = await admin.auth().verifyIdToken(token);
                req.user = {
                    uid: decodedToken.uid,
                    email: decodedToken.email,
                    name: decodedToken.name || decodedToken.email?.split('@')[0],
                    picture: decodedToken.picture,
                    provider: decodedToken.firebase?.sign_in_provider || 'google'
                };
                return next();
            } catch (firebaseError) {
                console.error('Firebase token verification failed:', firebaseError.message);
            }
        }

        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }
}

/**
 * Middleware: Verify Admin Access
 * Must be used AFTER verifyAuth
 */
async function verifyAdmin(req, res, next) {
    if (!req.user || !req.user.uid) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    try {
        const user = db.get("SELECT role FROM users WHERE id = ?", [req.user.uid]);
        if (!user || user.role !== 'admin') {
            console.warn(`⚠️ Unauthorized admin access attempt by ${req.user.uid} (${req.user.email})`);
            return res.status(403).json({ success: false, error: 'Access denied: Admin only' });
        }
        next();
    } catch (e) {
        console.error('Admin verification error:', e);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE: Admin Authorization
// ═══════════════════════════════════════════════════════════════════════════

function requireAdmin(req, res, next) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const user = db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);

        if (!user || user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Access denied: Admins only' });
        }

        next();
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES (Firebase-Only)
// ═══════════════════════════════════════════════════════════════════════════

// NOTE: /api/auth/register is DEPRECATED
// Registration is now 100% client-side via Firebase.
// User is created in SQLite on first verified login.

/**
 * POST /api/auth/login
 * 
 * Unified login endpoint - Firebase idToken only.
 * Accepts:
 *   - idToken: Firebase ID token (required)
 *   - displayName: Display name from registration form (optional, for new users)
 * 
 * Creates backend session and syncs user to SQLite.
 * Returns redirectUrl on success.
 */
app.post('/api/auth/login', async (req, res) => {
    try {
        const { idToken, displayName: requestDisplayName } = req.body;

        // ═══════════════════════════════════════════════════════════════
        // VALIDATE REQUEST
        // ═══════════════════════════════════════════════════════════════
        if (!idToken) {
            return res.status(400).json({
                success: false,
                error: 'idToken is required'
            });
        }

        if (!firebaseInitialized) {
            return res.status(500).json({
                success: false,
                error: 'Firebase not configured on server'
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // VERIFY FIREBASE TOKEN
        // ═══════════════════════════════════════════════════════════════
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (error) {
            console.error('Firebase token verification failed:', error.message);
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired Firebase token'
            });
        }

        const { uid: firebaseUid, email: fbEmail, name: tokenName, picture } = decodedToken;
        const provider = decodedToken.firebase?.sign_in_provider || 'unknown';
        const emailVerified = decodedToken.email_verified || false;

        // ═══════════════════════════════════════════════════════════════
        // STRICT EMAIL VERIFICATION GATE
        // Block email/password users who haven't verified their email
        // Google/Discord users are auto-verified by their providers
        // ═══════════════════════════════════════════════════════════════
        if (provider === 'password' && !emailVerified) {
            console.log(`⚠️ Email not verified for: ${fbEmail}`);
            return res.status(403).json({
                success: false,
                error: 'EMAIL_NOT_VERIFIED',
                message: 'Veuillez vérifier votre email avant de vous connecter.'
            });
        }

        if (!fbEmail) {
            return res.status(400).json({
                success: false,
                error: 'Email is required from Firebase'
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // DETERMINE DISPLAY NAME
        // Priority: request body > token > email prefix
        // ═══════════════════════════════════════════════════════════════
        const emailLower = fbEmail.toLowerCase();
        const displayName = requestDisplayName || tokenName || fbEmail.split('@')[0];

        // ═══════════════════════════════════════════════════════════════
        // SYNC USER TO SQLITE DATABASE
        // ═══════════════════════════════════════════════════════════════
        console.log('DEBUG 1: About to query user from DB');
        let user = db.get('SELECT * FROM users WHERE email = ?', [emailLower]);
        console.log('DEBUG 2: User query result:', user ? 'Found' : 'Not found');
        let isNewUser = false;

        if (user) {
            console.log('DEBUG 3: Updating existing user');
            // Update existing user
            db.run(`
                UPDATE users 
                SET firebase_uid = ?,
                    display_name = COALESCE(?, display_name),
                    avatar_url = COALESCE(?, avatar_url),
                    provider = COALESCE(?, provider),
                    last_login_at = datetime('now')
                WHERE email = ?
            `, [firebaseUid, displayName, picture, provider, emailLower]);

            user = db.get('SELECT * FROM users WHERE email = ?', [emailLower]);
            console.log(`🔑 Login (existing): ${emailLower} via ${provider}`);
        } else {
            // Create new user with signup bonus
            isNewUser = true;
            const userId = uuidv4();
            const newUserIP = getClientIP(req);
            const newUserRefCode = generateReferralCode(userId);

            // ═══════════════════════════════════════════════════════════════
            // REFERRAL SYSTEM: Anti-Fraud Check
            // ═══════════════════════════════════════════════════════════════
            let referredByUserId = null;
            const refCodeFromRequest = req.body.refCode || req.query.ref; // Support both body and query

            if (refCodeFromRequest) {
                const referrer = db.get('SELECT id, ip_address FROM users WHERE referral_code = ?', [refCodeFromRequest]);

                if (referrer) {
                    // SECURITY CHECK: Same IP = Self-Referral Fraud
                    if (referrer.ip_address === newUserIP) {
                        console.warn(`🚨 FRAUD BLOCKED: Self-referral attempt from IP ${newUserIP} (referrer: ${referrer.id})`);
                        // Silently ignore the referral - user is still created
                    } else {
                        referredByUserId = referrer.id;
                        console.log(`🤝 Valid referral: New user referred by ${referrer.id}`);
                    }
                } else {
                    console.log(`⚠️ Invalid referral code: ${refCodeFromRequest}`);
                }
            }

            db.run(`
                INSERT INTO users (id, email, display_name, avatar_url, provider, firebase_uid, balance, created_at, last_login_at, ip_address, referral_code, referred_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)
            `, [userId, emailLower, displayName, picture, provider, firebaseUid, SIGNUP_BONUS, newUserIP, newUserRefCode, referredByUserId]);

            // Add signup bonus transaction
            if (SIGNUP_BONUS > 0) {
                const txId = `bonus_${userId}_${Date.now()}`;
                db.run(`
                    INSERT INTO transactions (id, user_id, amount, type, source, description)
                    VALUES (?, ?, ?, 'credit', 'signup_bonus', 'Welcome bonus!')
                `, [txId, userId, SIGNUP_BONUS]);
                db.run('UPDATE users SET total_earned = total_earned + ? WHERE id = ?', [SIGNUP_BONUS, userId]);
            }

            user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
            console.log(`✨ Login (new user): ${emailLower} via ${provider} (+${SIGNUP_BONUS} pts) | Ref: ${referredByUserId || 'none'}`);
        }

        // ═══════════════════════════════════════════════════════════════
        // CREATE REDIS SESSION
        // ═══════════════════════════════════════════════════════════════
        console.log('DEBUG 4: About to create session for user:', user.id);
        console.log('DEBUG 4.1: Session data:', { id: user.id, email: user.email, username: user.display_name });
        try {
            createUserSession(req, {
                id: user.id,
                firebase_uid: firebaseUid,
                email: user.email,
                username: user.display_name,
                picture: user.avatar_url,
                provider: provider
            });
            console.log('DEBUG 5: createUserSession() completed successfully');
        } catch (sessionError) {
            console.error('❌ DEBUG: Session creation failed:', sessionError);
            throw sessionError;
        }

        console.log(`🔐 Session created for: ${emailLower}`);

        // ═══════════════════════════════════════════════════════════════
        // SUCCESS RESPONSE
        // ═══════════════════════════════════════════════════════════════
        console.log('DEBUG 6: About to send success response');

        // New users without a referrer see the welcome modal
        const needsWelcome = isNewUser && !referredByUserId;
        const redirectUrl = needsWelcome ? '/dashboard.html?welcome=1' : '/dashboard.html';

        console.log('DEBUG 7: Sending response with redirectUrl:', redirectUrl);
        return res.json({
            success: true,
            redirectUrl: redirectUrl,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                avatarUrl: user.avatar_url,
                balance: user.balance,
                totalEarned: user.total_earned || 0,
                provider: provider,
                isNewUser: isNewUser,
                signupBonus: isNewUser ? SIGNUP_BONUS : 0
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        console.error('Login error stack:', error.stack);
        res.status(500).json({ success: false, error: 'Login failed', details: error.message });
    }
});

/**
 * POST /api/auth/lookup-email
 * 
 * Lookup user email by pseudo (display_name).
 * Useful for login by pseudo instead of email.
 */
app.post('/api/auth/lookup-email', (req, res) => {
    try {
        const { pseudo } = req.body;

        if (!pseudo || pseudo.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Pseudo invalide'
            });
        }

        // Search for user by display_name (case-insensitive)
        const user = db.get(
            'SELECT email FROM users WHERE LOWER(display_name) = LOWER(?)',
            [pseudo.trim()]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Pseudo non trouvé'
            });
        }

        console.log(`🔍 Pseudo lookup: "${pseudo}" → ${user.email}`);

        res.json({
            success: true,
            email: user.email
        });

    } catch (error) {
        console.error('Lookup error:', error);
        res.status(500).json({ success: false, error: 'Lookup failed' });
    }
});

/**
 * GET /api/auth/me
 * 
 * Get current user info from JWT token.
 */
app.get('/api/auth/me', verifyAuth, (req, res) => {
    try {
        const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.uid]);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                avatarUrl: user.avatar_url,
                balance: user.balance,
                totalEarned: user.total_earned,
                totalWithdrawn: user.total_withdrawn,
                provider: user.provider || 'email'
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ success: false, error: 'Failed to get user info' });
    }
});


/**
 * POST /api/auth/logout
 * 
 * Destroy the Redis session and log out the user.
 */
app.post('/api/auth/logout', async (req, res) => {
    try {
        if (req.session) {
            await destroySession(req);
        }
        res.clearCookie('lq_session');
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
});

/**
 * GET /api/user/me
 * 
 * Get current authenticated user info from session.
 * No token required - uses Redis session.
 */
app.get('/api/user/me', isAuthenticated, (req, res) => {
    try {
        const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                avatarUrl: user.avatar_url,
                balance: user.balance,
                totalEarned: user.total_earned,
                totalWithdrawn: user.total_withdrawn,
                provider: user.provider || 'email',
                createdAt: user.created_at
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user info'
        });
    }
});

/**
 * GET /api/user/referral
 * 
 * Returns the user's referral code and referral statistics.
 */
app.get('/api/user/referral', isAuthenticated, (req, res) => {
    try {
        console.log(`📊 Fetching referral data for user: ${req.user.id}`);

        let user = db.get('SELECT id, referral_code, referred_by_user_id FROM users WHERE id = ?', [req.user.id]);

        if (!user) {
            console.error(`❌ User not found in DB: ${req.user.id}`);
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        console.log(`✅ User found:`, user);

        // AUTO-GENERATE referral code if user doesn't have one (legacy users)
        if (!user.referral_code) {
            try {
                const newCode = generateReferralCode(user.id);
                db.run('UPDATE users SET referral_code = ? WHERE id = ?', [newCode, user.id]);
                user.referral_code = newCode;
                console.log(`🔗 Generated referral code for legacy user: ${user.id} -> ${newCode}`);
            } catch (genError) {
                console.error('❌ Error generating referral code:', genError);
                // Continue anyway, we'll handle missing code later
            }
        }

        // Count how many users this person has referred
        let referralCount = 0;
        try {
            const countResult = db.get('SELECT COUNT(*) as count FROM users WHERE referred_by_user_id = ?', [req.user.id]);
            referralCount = countResult?.count || 0;
            console.log(`📈 Total referrals: ${referralCount}`);
        } catch (countError) {
            console.error('❌ Error counting referrals:', countError);
        }

        // Count unlocked referrals (those who passed the threshold)
        let unlockedCount = 0;
        try {
            const unlockedResult = db.get('SELECT COUNT(*) as count FROM users WHERE referred_by_user_id = ? AND referral_unlocked = 1', [req.user.id]);
            unlockedCount = unlockedResult?.count || 0;
            console.log(`🔓 Unlocked referrals: ${unlockedCount}`);
        } catch (unlockedError) {
            console.error('⚠️ Error counting unlocked (column may not exist):', unlockedError);
            // Column might not exist for legacy DB, default to 0
            unlockedCount = 0;
        }

        // Total commission earned from referrals
        let totalCommission = 0;
        try {
            const commissionResult = db.get("SELECT COALESCE(SUM(amount), 0) as sum FROM transactions WHERE user_id = ? AND source IN ('referral_bonus', 'referral_commission')", [req.user.id]);
            totalCommission = commissionResult?.sum || 0;
            console.log(`💰 Total commission: ${totalCommission}`);
        } catch (commissionError) {
            console.error('❌ Error calculating commission:', commissionError);
        }

        const response = {
            success: true,
            referralCode: user.referral_code,
            referralLink: isProduction ? `https://loot-quest.fr/?ref=${user.referral_code}` : `http://localhost:${PORT}/?ref=${user.referral_code}`,
            stats: {
                totalReferrals: referralCount,
                unlockedReferrals: unlockedCount,
                totalCommission: totalCommission,
                referralBonus: REFERRAL_BONUS,
                commissionRate: REFERRAL_COMMISSION_RATE * 100 // Display as percentage
            }
        };

        res.json(response);

    } catch (error) {
        console.error('Referral stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch referral stats' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/stats
 * Enhanced overview dashboard with fraud monitoring metrics
 */
app.get('/api/admin/stats', isAuthenticated, requireAdmin, (req, res) => {
    try {
        // Basic counts
        const usersCount = db.get('SELECT COUNT(*) as c FROM users').c;
        const pendingWithdrawals = db.get('SELECT COUNT(*) as c FROM withdrawals WHERE status="pending"').c;
        const openReports = db.get('SELECT COUNT(*) as c FROM support_tickets WHERE type="bug" AND status="new"').c;
        const unreadMessages = db.get('SELECT COUNT(*) as c FROM support_tickets WHERE type="contact" AND status="new"').c;

        // Online users (last activity within 5 minutes)
        const onlineUsers = db.get(`
            SELECT COUNT(*) as c FROM users 
            WHERE datetime(last_activity_at) > datetime('now', '-5 minutes')
        `).c || 0;

        // Daily points distributed (today's credits)
        const dailyPointsResult = db.get(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM transactions 
            WHERE type = 'credit' 
            AND date(created_at) = date('now')
        `);
        const dailyPoints = dailyPointsResult?.total || 0;

        // Total points distributed all time
        const totalPaid = db.get('SELECT COALESCE(SUM(amount), 0) as s FROM transactions WHERE type="credit"').s || 0;

        // Estimated revenue (40% of total points = platform profit)
        // Convert points to dollars: points / 1000
        const estimatedRevenue = Math.floor((totalPaid * PLATFORM_SPLIT) / POINTS_PER_DOLLAR * 100) / 100;
        const dailyRevenue = Math.floor((dailyPoints * PLATFORM_SPLIT) / POINTS_PER_DOLLAR * 100) / 100;

        res.json({
            success: true,
            stats: {
                users: usersCount,
                onlineUsers,
                totalPointsDistributed: totalPaid,
                dailyPointsDistributed: dailyPoints,
                pendingWithdrawals,
                openReports,
                unreadMessages,
                estimatedRevenue,
                dailyRevenue
            }
        });
    } catch (e) {
        console.error('Admin stats error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/admin/messages (Contact Us)
 */
app.get('/api/admin/messages', isAuthenticated, requireAdmin, (req, res) => {
    try {
        const messages = db.all('SELECT * FROM support_tickets WHERE type="contact" ORDER BY created_at DESC LIMIT 50');
        res.json({ success: true, messages });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/admin/orders (Pending Withdrawals)
 */
app.get('/api/admin/orders', isAuthenticated, requireAdmin, (req, res) => {
    try {
        const orders = db.all(`
            SELECT w.*, u.email, u.display_name, u.balance, u.total_earned, u.ip_address
            FROM withdrawals w
            JOIN users u ON w.user_id = u.id
            WHERE w.status = 'pending'
            ORDER BY w.created_at DESC
        `);
        res.json({ success: true, orders });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/resolve-ticket
 */
app.post('/api/admin/resolve-ticket', isAuthenticated, requireAdmin, (req, res) => {
    try {
        const { id, status } = req.body;
        db.run('UPDATE support_tickets SET status = ?, resolved_at = datetime("now") WHERE id = ?', [status, id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/process-order
 */
app.post('/api/admin/process-order', isAuthenticated, requireAdmin, (req, res) => {
    try {
        const { id, status, notes } = req.body;
        db.run('UPDATE withdrawals SET status = ?, admin_notes = ?, processed_at = datetime("now") WHERE id = ?', [status, notes, id]);
        if (status === 'completed') {
            db.run('UPDATE withdrawals SET completed_at = datetime("now") WHERE id = ?', [id]);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// FRAUD DETECTION ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/withdrawals/pending
 * Returns pending withdrawals with comprehensive fraud detection data
 */
app.get('/api/admin/withdrawals/pending', isAuthenticated, requireAdmin, (req, res) => {
    try {
        // Get pending withdrawals with user info
        const withdrawals = db.all(`
            SELECT 
                w.id,
                w.user_id,
                w.reward_id,
                w.reward_name,
                w.points_spent,
                w.delivery_info,
                w.status,
                w.created_at as request_date,
                NULL as request_ip, -- w.request_ip, TEMP FIX - column exists in file but not in sql.js cache
                NULL as request_user_agent, -- w.request_user_agent, TEMP FIX
                u.display_name,
                u.email,
                u.ip_address as registration_ip,
                u.user_agent as registration_user_agent,
                u.created_at as account_created,
                u.total_earned,
                u.total_withdrawn,
                u.balance,
                u.last_activity_at,
                u.role
            FROM withdrawals w
            JOIN users u ON w.user_id = u.id
            WHERE w.status = 'pending'
            ORDER BY w.created_at DESC
        `);

        // Enrich each withdrawal with fraud indicators
        const enrichedWithdrawals = withdrawals.map(w => {
            // Calculate account age in days
            const accountAge = Math.floor((Date.now() - new Date(w.account_created).getTime()) / (1000 * 60 * 60 * 24));

            // Check IP mismatch
            const ipMismatch = w.registration_ip && w.request_ip && w.registration_ip !== w.request_ip;

            // Get task history (last 10 completed offers)
            const taskHistory = db.all(`
                SELECT offer_name, amount, created_at, ip_address
                FROM transactions 
                WHERE user_id = ? AND type = 'credit' AND source = 'lootably'
                ORDER BY created_at DESC
                LIMIT 10
            `, [w.user_id]);

            // Calculate velocity (points earned in last hour)
            const velocityResult = db.get(`
                SELECT COALESCE(SUM(amount), 0) as total 
                FROM transactions 
                WHERE user_id = ? AND type = 'credit' 
                AND datetime(created_at) > datetime('now', '-1 hour')
            `, [w.user_id]);
            const hourlyVelocity = velocityResult?.total || 0;

            // Determine risk level
            let riskLevel = 'low';
            let riskFlags = [];

            if (accountAge < 1) {
                riskLevel = 'high';
                riskFlags.push('Account < 24 hours old');
            } else if (accountAge < 7) {
                if (riskLevel !== 'high') riskLevel = 'medium';
                riskFlags.push('Account < 7 days old');
            }

            if (ipMismatch) {
                if (riskLevel !== 'high') riskLevel = 'medium';
                riskFlags.push('IP mismatch between registration and withdrawal');
            }

            if (hourlyVelocity > 5000) {
                riskLevel = 'high';
                riskFlags.push(`High velocity: ${hourlyVelocity} points in last hour`);
            } else if (hourlyVelocity > 2000) {
                if (riskLevel !== 'high') riskLevel = 'medium';
                riskFlags.push(`Elevated velocity: ${hourlyVelocity} points in last hour`);
            }

            // Check if earnings are suspicious (earned more than withdrew + balance)
            if (w.total_earned > 0 && taskHistory.length < 3 && w.points_spent > 5000) {
                if (riskLevel !== 'high') riskLevel = 'medium';
                riskFlags.push('Low activity but high withdrawal');
            }

            return {
                id: w.id,
                userId: w.user_id,
                rewardName: w.reward_name,
                pointsSpent: w.points_spent,
                deliveryInfo: w.delivery_info,
                requestDate: w.request_date,
                user: {
                    displayName: w.display_name,
                    email: w.email,
                    accountAge,
                    totalEarned: w.total_earned,
                    totalWithdrawn: w.total_withdrawn,
                    balance: w.balance
                },
                security: {
                    registrationIp: w.registration_ip,
                    requestIp: w.request_ip,
                    ipMismatch,
                    userAgent: w.request_user_agent || w.registration_user_agent,
                    lastActivity: w.last_activity_at
                },
                taskHistory,
                riskLevel,
                riskFlags,
                hourlyVelocity
            };
        });

        res.json({
            success: true,
            withdrawals: enrichedWithdrawals,
            count: enrichedWithdrawals.length
        });

    } catch (e) {
        console.error('Pending withdrawals error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/admin/user/:userId/security
 * Returns detailed user security profile for inspection modal
 */
app.get('/api/admin/user/:userId/security', isAuthenticated, requireAdmin, (req, res) => {
    try {
        const { userId } = req.params;

        // Get user info (exclude sensitive data like password_hash)
        const user = db.get(`
            SELECT 
                id, email, display_name, avatar_url, provider,
                balance, total_earned, total_withdrawn,
                created_at, last_login_at, last_activity_at,
                ip_address, user_agent, role,
                referral_code, referred_by_user_id,
                lifetime_earnings, referral_unlocked
            FROM users WHERE id = ?
        `, [userId]);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Get transaction history (last 50)
        const transactions = db.all(`
            SELECT id, amount, type, source, offer_name, description, ip_address, created_at
            FROM transactions 
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 50
        `, [userId]);

        // Get withdrawal history
        const withdrawals = db.all(`
            SELECT id, reward_name, points_spent, status, created_at, processed_at, completed_at, request_ip
            FROM withdrawals 
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 20
        `, [userId]);

        // Calculate suspicious patterns
        const accountAge = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));

        // Get unique IPs used
        const uniqueIps = db.all(`
            SELECT DISTINCT ip_address, COUNT(*) as count 
            FROM transactions 
            WHERE user_id = ? AND ip_address IS NOT NULL
            GROUP BY ip_address
        `, [userId]);

        // Calculate earnings velocity (points per day)
        const earningsPerDay = accountAge > 0 ? Math.round(user.total_earned / accountAge) : user.total_earned;

        // Get referrer info if referred
        let referrer = null;
        if (user.referred_by_user_id) {
            referrer = db.get('SELECT display_name, email FROM users WHERE id = ?', [user.referred_by_user_id]);
        }

        // Get users this person referred
        const referrals = db.all(`
            SELECT id, display_name, created_at, total_earned 
            FROM users 
            WHERE referred_by_user_id = ?
        `, [userId]);

        // Build suspicious activity flags
        const suspiciousFlags = [];

        if (accountAge < 1 && user.total_earned > 1000) {
            suspiciousFlags.push({ type: 'velocity', message: 'Earned over 1000 points in first 24 hours' });
        }

        if (uniqueIps.length > 5) {
            suspiciousFlags.push({ type: 'ip', message: `Used ${uniqueIps.length} different IP addresses` });
        }

        if (earningsPerDay > 10000) {
            suspiciousFlags.push({ type: 'earnings', message: `Extremely high earnings: ${earningsPerDay} pts/day average` });
        }

        // Check for same-IP referrals
        const sameIpReferrals = referrals.filter(r => {
            const refUser = db.get('SELECT ip_address FROM users WHERE id = ?', [r.id]);
            return refUser && refUser.ip_address === user.ip_address;
        });

        if (sameIpReferrals.length > 0) {
            suspiciousFlags.push({ type: 'referral', message: `${sameIpReferrals.length} referrals share same IP (self-referral?)` });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                avatarUrl: user.avatar_url,
                provider: user.provider,
                balance: user.balance,
                totalEarned: user.total_earned,
                totalWithdrawn: user.total_withdrawn,
                createdAt: user.created_at,
                lastLoginAt: user.last_login_at,
                lastActivityAt: user.last_activity_at,
                role: user.role,
                accountAge,
                earningsPerDay
            },
            security: {
                registrationIp: user.ip_address,
                registrationUserAgent: user.user_agent,
                uniqueIps,
                suspiciousFlags
            },
            transactions,
            withdrawals,
            referral: {
                code: user.referral_code,
                referrer,
                referrals: referrals.map(r => ({
                    displayName: r.display_name,
                    createdAt: r.created_at,
                    totalEarned: r.total_earned
                }))
            }
        });

    } catch (e) {
        console.error('User security error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/withdrawals/:id/action
 * Process withdrawal with approve/reject/ban options
 */
app.post('/api/admin/withdrawals/:id/action', isAuthenticated, requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { action, notes } = req.body; // action: 'approve', 'reject', 'ban'

        // Get the withdrawal
        const withdrawal = db.get('SELECT * FROM withdrawals WHERE id = ?', [id]);
        if (!withdrawal) {
            return res.status(404).json({ success: false, error: 'Withdrawal not found' });
        }

        if (withdrawal.status !== 'pending') {
            return res.status(400).json({ success: false, error: 'Withdrawal already processed' });
        }

        const userId = withdrawal.user_id;
        const adminNotes = notes || `Processed by admin: ${action}`;

        switch (action) {
            case 'approve':
                // Mark as completed
                db.run(`
                    UPDATE withdrawals 
                    SET status = 'completed', 
                        admin_notes = ?, 
                        processed_at = datetime('now'),
                        completed_at = datetime('now')
                    WHERE id = ?
                `, [adminNotes, id]);

                console.log(`✅ Withdrawal #${id} APPROVED for user ${userId}`);
                break;

            case 'reject':
                // Reject and refund points
                db.run(`
                    UPDATE withdrawals 
                    SET status = 'cancelled', 
                        admin_notes = ?, 
                        processed_at = datetime('now')
                    WHERE id = ?
                `, [adminNotes, id]);

                // Refund points to user
                db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [withdrawal.points_spent, userId]);

                // Log refund transaction
                const refundTxId = `refund_${id}_${Date.now()}`;
                db.run(`
                    INSERT INTO transactions (id, user_id, amount, type, source, description)
                    VALUES (?, ?, ?, 'credit', 'admin_refund', ?)
                `, [refundTxId, userId, withdrawal.points_spent, `Withdrawal #${id} rejected - points refunded`]);

                console.log(`❌ Withdrawal #${id} REJECTED - ${withdrawal.points_spent} points refunded to user ${userId}`);
                break;

            case 'ban':
                // Reject, refund, and ban user
                db.run(`
                    UPDATE withdrawals 
                    SET status = 'cancelled', 
                        admin_notes = ?, 
                        processed_at = datetime('now')
                    WHERE id = ?
                `, [`BANNED: ${adminNotes}`, id]);

                // Refund points
                db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [withdrawal.points_spent, userId]);

                // Log refund
                const banRefundTxId = `refund_ban_${id}_${Date.now()}`;
                db.run(`
                    INSERT INTO transactions (id, user_id, amount, type, source, description)
                    VALUES (?, ?, ?, 'credit', 'admin_refund', ?)
                `, [banRefundTxId, userId, withdrawal.points_spent, `Withdrawal #${id} - banned user refund`]);

                // Ban the user (set role to 'banned')
                db.run("UPDATE users SET role = 'banned' WHERE id = ?", [userId]);

                // Cancel all other pending withdrawals from this user
                db.run(`
                    UPDATE withdrawals 
                    SET status = 'cancelled', admin_notes = 'User banned'
                    WHERE user_id = ? AND status = 'pending'
                `, [userId]);

                console.log(`🚫 User ${userId} BANNED - Withdrawal #${id} cancelled`);
                break;

            default:
                return res.status(400).json({ success: false, error: 'Invalid action. Use: approve, reject, or ban' });
        }

        res.json({
            success: true,
            message: `Withdrawal ${action}ed successfully`,
            action,
            withdrawalId: id
        });

    } catch (e) {
        console.error('Withdrawal action error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/setup-first-admin
 * TEMPORARY: One-time setup endpoint to grant admin to ExiZ Binks
 * This runs INSIDE the server so it modifies the in-memory DB
 */
app.post('/api/admin/setup-first-admin', (req, res) => {
    try {
        const SECRET_KEY = req.body.secret;

        // Simple security check
        if (SECRET_KEY !== 'lootquest_setup_2024') {
            return res.status(403).json({ success: false, error: 'Invalid secret key' });
        }

        // Find ExiZ Binks
        const user = db.get('SELECT * FROM users WHERE email LIKE ?', ['%exizfr%']);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        console.log('🔧 SETUP: Found user:', user.email);

        // Update the user
        db.run(`
            UPDATE users 
            SET balance = ?,
                total_earned = ?,
                role = 'admin'
            WHERE id = ?
        `, [1000000000, 1000000000, user.id]);

        console.log('✅ SETUP: Admin role and points granted!');

        res.json({
            success: true,
            message: 'Admin setup complete',
            user: {
                email: user.email,
                balance: 1000000000,
                role: 'admin'
            }
        });

    } catch (e) {
        console.error('Setup error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/user/apply-referral
 * 
 * Allows a new user to apply a referral code after registration.
 * Only works if user doesn't already have a referrer.
 */
app.post('/api/user/apply-referral', isAuthenticated, (req, res) => {
    try {
        const { refCode } = req.body;
        const userId = req.user.id;
        const userIP = getClientIP(req);

        if (!refCode) {
            return res.status(400).json({ success: false, error: 'Referral code is required' });
        }

        // Check if user already has a referrer
        const user = db.get('SELECT referred_by_user_id FROM users WHERE id = ?', [userId]);
        if (user && user.referred_by_user_id) {
            return res.status(400).json({ success: false, error: 'Vous avez déjà un parrain' });
        }

        // Find the referrer
        const referrer = db.get('SELECT id, display_name, ip_address FROM users WHERE referral_code = ?', [refCode]);
        if (!referrer) {
            return res.status(404).json({ success: false, error: 'Code de parrainage invalide' });
        }

        // Security: Can't refer yourself
        if (referrer.id === userId) {
            return res.status(400).json({ success: false, error: 'Vous ne pouvez pas utiliser votre propre code' });
        }

        // Security: Same IP check
        if (referrer.ip_address === userIP) {
            console.warn(`🚨 FRAUD BLOCKED (post-reg): Same IP ${userIP} for user ${userId} and referrer ${referrer.id}`);
            return res.status(400).json({ success: false, error: 'Code invalide' }); // Vague error for security
        }

        // Apply the referral
        db.run('UPDATE users SET referred_by_user_id = ? WHERE id = ?', [referrer.id, userId]);

        console.log(`🤝 Referral applied: ${userId} now referred by ${referrer.id}`);

        res.json({
            success: true,
            referrerName: referrer.display_name || 'votre parrain'
        });

    } catch (error) {
        console.error('Apply referral error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// HYBRID AUTH: Firebase (Google) + Discord OAuth2
// ═══════════════════════════════════════════════════════════════════════════


/**
 * POST /api/auth/firebase
 * 
 * Verify Firebase idToken and create/link user account.
 * Links by email if account already exists (e.g., from Discord).
 */
app.post('/api/auth/firebase', async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ success: false, error: 'idToken is required' });
        }

        // Verify Firebase token
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (error) {
            console.error('Firebase token verification failed:', error.message);
            return res.status(401).json({ success: false, error: 'Invalid Firebase token' });
        }

        const { uid: firebaseUid, email, name, picture } = decodedToken;

        if (!email) {
            return res.status(400).json({ success: false, error: 'Email is required from Firebase' });
        }

        const emailLower = email.toLowerCase();

        // Check if user exists by email (could be from Discord or email registration)
        let user = db.get('SELECT * FROM users WHERE email = ?', [emailLower]);

        if (user) {
            // Link Firebase UID to existing account
            db.run(`
                UPDATE users 
                SET firebase_uid = ?,
            display_name = COALESCE(?, display_name),
            avatar_url = COALESCE(?, avatar_url),
            last_login_at = datetime('now')
                WHERE email = ?
            `, [firebaseUid, name, picture, emailLower]);

            user = db.get('SELECT * FROM users WHERE email = ?', [emailLower]);
            console.log(`🔗 Linked Firebase to existing account: ${emailLower} `);
        } else {
            // Create new user with Firebase info
            const userId = uuidv4();
            db.run(`
                INSERT INTO users(id, email, display_name, avatar_url, provider, firebase_uid, balance, created_at, last_login_at)
        VALUES(?, ?, ?, ?, 'firebase', ?, 0, datetime('now'), datetime('now'))
            `, [userId, emailLower, name || email.split('@')[0], picture, firebaseUid]);

            user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
            console.log(`✨ New user created via Firebase: ${emailLower} `);
        }

        // Generate session JWT
        const token = generateToken(user);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                avatarUrl: user.avatar_url,
                balance: user.balance,
                totalEarned: user.total_earned,
                provider: user.provider,
                linkedAccounts: {
                    firebase: !!user.firebase_uid,
                    discord: !!user.discord_id
                }
            }
        });

    } catch (error) {
        console.error('Firebase auth error:', error);
        res.status(500).json({ success: false, error: 'Authentication failed' });
    }
});

/**
 * GET /api/auth/discord
 * 
 * Redirect to Discord OAuth2 authorization page.
 */
app.get('/api/auth/discord', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;

    if (!clientId || !redirectUri) {
        return res.status(500).json({ success: false, error: 'Discord OAuth not configured' });
    }

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'identify email'
    });

    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

/**
 * GET /api/auth/discord/callback
 * 
 * Handle Discord OAuth2 callback.
 * Exchange code for token, fetch user, create/link account by email.
 */
app.get('/api/auth/discord/callback', async (req, res) => {
    try {
        const { code, error: oauthError } = req.query;

        if (oauthError) {
            console.error('Discord OAuth error:', oauthError);
            return res.redirect('/?error=discord_denied');
        }

        if (!code) {
            return res.redirect('/?error=no_code');
        }

        const clientId = process.env.DISCORD_CLIENT_ID;
        const clientSecret = process.env.DISCORD_CLIENT_SECRET;
        const redirectUri = process.env.DISCORD_REDIRECT_URI;

        // Exchange code for access token
        let tokenResponse;
        try {
            tokenResponse = await axios.post('https://discord.com/api/oauth2/token',
                new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri
                }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
            );
        } catch (error) {
            console.error('Discord token exchange failed:', error.response?.data || error.message);
            return res.redirect('/?error=token_exchange_failed');
        }

        const accessToken = tokenResponse.data.access_token;

        // Fetch Discord user profile
        let discordUser;
        try {
            const userResponse = await axios.get('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            discordUser = userResponse.data;
        } catch (error) {
            console.error('Discord user fetch failed:', error.response?.data || error.message);
            return res.redirect('/?error=user_fetch_failed');
        }

        const { id: discordId, email, username, avatar, global_name } = discordUser;

        if (!email) {
            return res.redirect('/?error=email_required');
        }

        const emailLower = email.toLowerCase();
        const displayName = global_name || username;
        const avatarUrl = avatar
            ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordId) % 5}.png`;

        // Check if user exists by email (could be from Firebase or email registration)
        let user = db.get('SELECT * FROM users WHERE email = ?', [emailLower]);

        if (user) {
            // Link Discord to existing account
            db.run(`
                UPDATE users 
                SET discord_id = ?,
                    discord_username = ?,
                    discord_avatar = ?,
                    display_name = COALESCE(display_name, ?),
                    avatar_url = COALESCE(avatar_url, ?),
                    last_login_at = datetime('now')
                WHERE email = ?
            `, [discordId, username, avatar, displayName, avatarUrl, emailLower]);

            user = db.get('SELECT * FROM users WHERE email = ?', [emailLower]);
            console.log(`🔗 Linked Discord to existing account: ${emailLower}`);
        } else {
            // Create new user with Discord info
            const userId = uuidv4();
            db.run(`
                INSERT INTO users (id, email, display_name, avatar_url, provider, discord_id, discord_username, discord_avatar, balance, created_at, last_login_at)
                VALUES (?, ?, ?, ?, 'discord', ?, ?, ?, 0, datetime('now'), datetime('now'))
            `, [userId, emailLower, displayName, avatarUrl, discordId, username, avatar]);

            user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
            console.log(`✨ New user created via Discord: ${emailLower}`);
        }

        // Create Redis session for the user
        createUserSession(req, {
            id: user.id,
            firebase_uid: null,
            email: user.email,
            username: user.display_name,
            picture: user.avatar_url,
            provider: 'discord'
        });

        console.log(`🔐 Discord session created for: ${emailLower}`);

        // Redirect directly to dashboard
        res.redirect('/dashboard.html');

    } catch (error) {
        console.error('Discord callback error:', error);
        res.redirect('/?error=auth_failed');
    }
});


// ═══════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/user/login
 * 
 * Validates Firebase JWT and syncs user profile to database.
 * Creates new user if first login, updates last_login otherwise.
 * Awards signup bonus for new users.
 */
app.post('/api/user/login', verifyAuth, (req, res) => {
    try {
        const { uid, email, name, picture, provider } = req.user;

        // Check if user exists
        const existingUser = db.get('SELECT * FROM users WHERE id = ?', [uid]);

        if (existingUser) {
            // Update last login
            db.run(`
                UPDATE users 
                SET last_login_at = datetime('now'),
                    display_name = COALESCE(?, display_name),
                    avatar_url = COALESCE(?, avatar_url)
                WHERE id = ?
            `, [name, picture, uid]);

            const user = db.get('SELECT * FROM users WHERE id = ?', [uid]);

            return res.json({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.display_name,
                    avatarUrl: user.avatar_url,
                    balance: user.balance,
                    totalEarned: user.total_earned,
                    totalWithdrawn: user.total_withdrawn,
                    createdAt: user.created_at,
                    isNewUser: false
                }
            });
        }

        // Create new user
        db.run(`
            INSERT INTO users (id, email, display_name, avatar_url, provider, balance, last_login_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `, [uid, email, name, picture, provider, SIGNUP_BONUS]);

        // Add signup bonus transaction
        if (SIGNUP_BONUS > 0) {
            const txId = `bonus_${uid}_${Date.now()}`;
            db.run(`
                INSERT INTO transactions (id, user_id, amount, type, source, description)
                VALUES (?, ?, ?, 'credit', 'signup_bonus', 'Welcome bonus!')
            `, [txId, uid, SIGNUP_BONUS]);

            // Update total earned
            db.run('UPDATE users SET total_earned = total_earned + ? WHERE id = ?', [SIGNUP_BONUS, uid]);
        }

        const newUser = db.get('SELECT * FROM users WHERE id = ?', [uid]);

        console.log(`👤 New user registered: ${email} (Bonus: ${SIGNUP_BONUS} pts)`);

        res.json({
            success: true,
            user: {
                id: newUser.id,
                email: newUser.email,
                displayName: newUser.display_name,
                avatarUrl: newUser.avatar_url,
                balance: newUser.balance,
                totalEarned: newUser.total_earned,
                totalWithdrawn: newUser.total_withdrawn,
                createdAt: newUser.created_at,
                isNewUser: true,
                signupBonus: SIGNUP_BONUS
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Database error during login' });
    }
});

/**
 * GET /api/user/balance
 * 
 * Returns the current user's balance and statistics.
 */
app.get('/api/user/balance', verifyAuth, (req, res) => {
    try {
        const user = db.get(`
            SELECT balance, total_earned, total_withdrawn, created_at, first_withdrawal_at 
            FROM users WHERE id = ?
        `, [req.user.uid]);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Calculate if 7-day rule applies
        let canWithdraw = true;
        let daysRemaining = 0;

        if (!user.first_withdrawal_at) {
            // First withdrawal check - using created_at
            const accountAge = Date.now() - new Date(user.created_at).getTime();
            if (accountAge < SEVEN_DAYS_MS) {
                canWithdraw = false;
                daysRemaining = Math.ceil((SEVEN_DAYS_MS - accountAge) / (24 * 60 * 60 * 1000));
            }
        }

        res.json({
            success: true,
            balance: user.balance,
            totalEarned: user.total_earned,
            totalWithdrawn: user.total_withdrawn,
            canWithdraw,
            daysRemaining,
            firstWithdrawalAt: user.first_withdrawal_at
        });

    } catch (error) {
        console.error('Balance error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch balance' });
    }
});

/**
 * GET /api/user/transactions
 * 
 * Returns paginated transaction history for the current user.
 * Query params: limit (default 50), offset (default 0)
 */
app.get('/api/user/transactions', verifyAuth, (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = parseInt(req.query.offset) || 0;

        const transactions = db.all(`
            SELECT id, amount, type, source, offer_name, description, created_at
            FROM transactions 
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [req.user.uid, limit, offset]);

        const countResult = db.get('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?', [req.user.uid]);
        const total = countResult ? countResult.count : 0;

        res.json({
            success: true,
            transactions,
            pagination: {
                limit,
                offset,
                total,
                hasMore: offset + transactions.length < total
            }
        });

    } catch (error) {
        console.error('Transactions error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
    }
});

/**
 * GET /api/user/withdrawals
 * 
 * Returns withdrawal history for the current user.
 */
app.get('/api/user/withdrawals', verifyAuth, (req, res) => {
    try {
        const withdrawals = db.all(`
            SELECT id, reward_id, reward_name, points_spent, status, created_at, completed_at
            FROM withdrawals 
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 50
        `, [req.user.uid]);

        res.json({ success: true, withdrawals });

    } catch (error) {
        console.error('Withdrawals error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch withdrawals' });
    }
});

/**
 * GET /api/postback/lootably
 * 
 * Handles Lootably postback notifications.
 * Security: Validates secret key and optional IP whitelist.
 * Idempotency: Uses transaction_id to prevent double-crediting.
 * 
 * Expected query params:
 * - user_id: Firebase UID
 * - payout: Points to credit (in cents, we'll convert)
 * - transaction_id: Unique Lootably transaction ID
 * - secret: Your Lootably secret key
 * - offer_name (optional): Name of the completed offer
 */
app.get('/api/postback/lootably', (req, res) => {
    try {
        const clientIP = getClientIP(req);
        const { user_id, payout, transaction_id, secret, offer_name } = req.query;

        // Log postback attempt
        console.log(`📨 Postback received from ${clientIP}:`, { user_id, payout, transaction_id, offer_name });

        // Validate required parameters
        if (!user_id || !payout || !transaction_id || !secret) {
            console.warn('❌ Postback missing required params');
            return res.status(400).json({ success: false, error: 'Missing required parameters' });
        }

        // Validate secret key
        if (secret !== LOOTABLY_SECRET) {
            console.warn(`❌ Invalid secret from ${clientIP}`);
            return res.status(403).json({ success: false, error: 'Invalid secret key' });
        }

        // Validate IP whitelist (if configured)
        if (LOOTABLY_IP_WHITELIST.length > 0 && !LOOTABLY_IP_WHITELIST.includes(clientIP)) {
            console.warn(`❌ IP not whitelisted: ${clientIP}`);
            return res.status(403).json({ success: false, error: 'IP not authorized' });
        }

        // Parse payout (Lootably sends in cents, we store as points)
        const points = Math.floor(parseFloat(payout));
        if (isNaN(points) || points <= 0) {
            console.warn('❌ Invalid payout amount:', payout);
            return res.status(400).json({ success: false, error: 'Invalid payout amount' });
        }

        // Check if user exists
        const user = db.get('SELECT id FROM users WHERE id = ?', [user_id]);
        if (!user) {
            console.warn(`❌ User not found: ${user_id}`);
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Check for duplicate transaction (idempotency)
        const existingTx = db.get('SELECT id FROM transactions WHERE id = ?', [transaction_id]);
        if (existingTx) {
            console.log(`⚠️  Duplicate transaction ignored: ${transaction_id}`);
            return res.json({ success: true, message: 'Transaction already processed' });
        }

        // Insert transaction
        db.run(`
            INSERT INTO transactions (id, user_id, amount, type, source, offer_name, description, ip_address)
            VALUES (?, ?, ?, 'credit', 'lootably', ?, ?, ?)
        `, [
            transaction_id,
            user_id,
            points,
            offer_name || 'Offer completed',
            `Earned ${points} points from Lootably`,
            clientIP
        ]);

        // Update user balance, total earned, AND lifetime_earnings (for referral threshold)
        db.run(`
            UPDATE users 
            SET balance = balance + ?, 
                total_earned = total_earned + ?,
                lifetime_earnings = lifetime_earnings + ?
            WHERE id = ?
        `, [points, points, points, user_id]);

        console.log(`✅ Credited ${points} points to user ${user_id} (tx: ${transaction_id})`);

        // ═══════════════════════════════════════════════════════════════════════════
        // REFERRAL SYSTEM: Unlock Check & Commission
        // ═══════════════════════════════════════════════════════════════════════════
        const updatedUser = db.get('SELECT lifetime_earnings, referral_unlocked, referred_by_user_id FROM users WHERE id = ?', [user_id]);

        if (updatedUser && updatedUser.referred_by_user_id) {
            const referrerId = updatedUser.referred_by_user_id;

            // 1. CHECK FOR THRESHOLD UNLOCK (One-Time Bonus)
            if (updatedUser.lifetime_earnings >= REFERRAL_THRESHOLD && updatedUser.referral_unlocked === 0) {
                // Credit the referrer with ACTIVATION BONUS
                db.run('UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                    [REFERRAL_BONUS, REFERRAL_BONUS, referrerId]);

                // Log the bonus transaction
                const bonusTxId = `ref_bonus_${referrerId}_${Date.now()}`;
                db.run(`
                    INSERT INTO transactions (id, user_id, amount, type, source, description)
                    VALUES (?, ?, ?, 'credit', 'referral_bonus', ?)
                `, [bonusTxId, referrerId, REFERRAL_BONUS, `Referral unlocked! (User ${user_id.substring(0, 8)}...)`]);

                // Mark as unlocked to prevent duplicate bonuses
                db.run('UPDATE users SET referral_unlocked = 1 WHERE id = ?', [user_id]);

                console.log(`🎉 REFERRAL UNLOCKED: ${REFERRAL_BONUS} pts bonus to referrer ${referrerId}`);
            }

            // 2. CREDIT LIFETIME COMMISSION (Always, on every offer completion)
            const commission = Math.floor(points * REFERRAL_COMMISSION_RATE);
            if (commission > 0) {
                db.run('UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                    [commission, commission, referrerId]);

                // Log the commission transaction
                const commTxId = `ref_comm_${referrerId}_${Date.now()}`;
                db.run(`
                    INSERT INTO transactions (id, user_id, amount, type, source, description)
                    VALUES (?, ?, ?, 'credit', 'referral_commission', ?)
                `, [commTxId, referrerId, commission, `${Math.round(REFERRAL_COMMISSION_RATE * 100)}% commission from referral`]);

                console.log(`📈 COMMISSION: ${commission} pts (${Math.round(REFERRAL_COMMISSION_RATE * 100)}% of ${points}) to referrer ${referrerId}`);
            }
        }

        res.json({ success: true, message: `Credited ${points} points` });

    } catch (error) {
        console.error('Postback error:', error);
        res.status(500).json({ success: false, error: 'Server error processing postback' });
    }
});

/**
 * GET /api/rewards
 * 
 * Returns the rewards catalog from rewards.json.
 * Public endpoint - no auth required.
 */
app.get('/api/rewards', (req, res) => {
    const { category } = req.query;

    let brands = rewardsCatalog.brands;

    // Filter by category if provided
    if (category && category !== 'all') {
        brands = brands.filter(b => b.category === category);
    }

    res.json({ success: true, brands });
});

/**
 * POST /api/withdraw
 * 
 * Processes a withdrawal request.
 * 
 * Security measures:
 * 1. JWT authentication required
 * 2. Reward price fetched from server-side rewards.json (never trust client)
 * 3. 7-day retention rule for first withdrawal
 * 4. Balance check before processing
 * 
 * Body params:
 * - rewardId: ID of reward from rewards.json
 * - deliveryInfo (optional): Email, username, etc. for delivery
 */
app.post('/api/withdraw', verifyAuth, (req, res) => {
    try {
        const { rewardId, deliveryInfo } = req.body;
        const userId = req.user.uid;

        // Validate reward ID
        if (!rewardId) {
            return res.status(400).json({ success: false, error: 'Reward ID is required' });
        }

        // Get reward from server-side catalog (NEVER trust client price)
        const reward = getRewardById(rewardId);
        if (!reward) {
            return res.status(404).json({ success: false, error: 'Reward not found' });
        }

        // Construct reward name for records
        const rewardName = `${reward.brandName} ${reward.amount}`;

        // Get user from database
        const user = db.get(`
            SELECT balance, created_at, first_withdrawal_at, personal_info_completed 
            FROM users WHERE id = ?
        `, [userId]);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Check if personal info is required (first withdrawal)
        if (!user.personal_info_completed) {
            return res.status(400).json({
                success: false,
                error: 'Personal information required for first withdrawal',
                code: 'PERSONAL_INFO_REQUIRED',
                needsPersonalInfo: true
            });
        }

        // Check 7-day rule for first withdrawal (TEMPORARILY DISABLED FOR TESTING)
        /*
        if (!user.first_withdrawal_at) {
            const accountAge = Date.now() - new Date(user.created_at).getTime();
            if (accountAge < SEVEN_DAYS_MS) {
                const daysRemaining = Math.ceil((SEVEN_DAYS_MS - accountAge) / (24 * 60 * 60 * 1000));
                return res.status(403).json({
                    success: false,
                    error: `First withdrawal requires 7 days. ${daysRemaining} day(s) remaining.`,
                    daysRemaining
                });
            }
        }
        */


        // Check balance
        if (user.balance < reward.price) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient balance',
                required: reward.price,
                current: user.balance
            });
        }

        // Deduct balance
        db.run(`
            UPDATE users 
            SET balance = balance - ?, 
            total_withdrawn = total_withdrawn + ?,
            first_withdrawal_at = COALESCE(first_withdrawal_at, datetime('now'))
            WHERE id = ?
        `, [reward.price, reward.price, userId]);

        // Create debit transaction
        const txId = `withdraw_${userId}_${Date.now()}`;
        db.run(`
            INSERT INTO transactions (id, user_id, amount, type, source, description)
            VALUES (?, ?, ?, 'debit', 'withdrawal', ?)
        `, [txId, userId, reward.price, `Redeemed: ${rewardName}`]);

        // Create withdrawal record with fraud tracking data
        const requestIp = getClientIP(req);
        const requestUserAgent = req.headers['user-agent'] || null;

        db.run(`
            INSERT INTO withdrawals (user_id, reward_id, reward_name, points_spent, delivery_info, status, request_ip, request_user_agent)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
        `, [userId, rewardId, rewardName, reward.price, deliveryInfo || null, requestIp, requestUserAgent]);

        // Get the last insert ID (for the withdrawal)
        const lastWithdrawal = db.get('SELECT id FROM withdrawals ORDER BY id DESC LIMIT 1');
        const withdrawalId = lastWithdrawal ? lastWithdrawal.id : 0;

        // Get updated balance
        const updatedUser = db.get('SELECT balance FROM users WHERE id = ?', [userId]);

        console.log(`🎁 Withdrawal processed: ${rewardName} for user ${userId} (ID: ${withdrawalId})`);

        res.json({
            success: true,
            message: 'Withdrawal request submitted successfully!',
            withdrawal: {
                id: withdrawalId,
                reward: rewardName,
                pointsSpent: reward.price,
                status: 'pending'
            },
            newBalance: updatedUser ? updatedUser.balance : 0
        });

    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ success: false, error: 'Failed to process withdrawal' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PERSONAL INFO ROUTES (KYC for Withdrawals)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/user/personal-info
 * Check if user has completed personal info
 */
app.get('/api/user/personal-info', verifyAuth, (req, res) => {
    try {
        const userId = req.user.uid;
        const user = db.get(`
            SELECT first_name, last_name, address, city, postal_code, country, personal_info_completed
            FROM users WHERE id = ?
        `, [userId]);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            completed: !!user.personal_info_completed,
            info: user.personal_info_completed ? {
                firstName: user.first_name,
                lastName: user.last_name,
                address: user.address,
                city: user.city,
                postalCode: user.postal_code,
                country: user.country
            } : null
        });
    } catch (e) {
        console.error('Personal info check error:', e);
        res.status(500).json({ success: false, error: 'Failed to check personal info' });
    }
});

/**
 * POST /api/user/personal-info
 * Save user personal info for KYC (first withdrawal requirement)
 */
app.post('/api/user/personal-info', verifyAuth, (req, res) => {
    try {
        const userId = req.user.uid;
        const { firstName, lastName, address, city, postalCode, country } = req.body;

        // Validation
        if (!firstName || !lastName || !address || !city || !postalCode || !country) {
            return res.status(400).json({
                success: false,
                error: 'All fields are required: firstName, lastName, address, city, postalCode, country'
            });
        }

        // Basic validation
        if (firstName.length < 2 || firstName.length > 50) {
            return res.status(400).json({ success: false, error: 'First name must be between 2 and 50 characters' });
        }
        if (lastName.length < 2 || lastName.length > 50) {
            return res.status(400).json({ success: false, error: 'Last name must be between 2 and 50 characters' });
        }
        if (address.length < 5 || address.length > 200) {
            return res.status(400).json({ success: false, error: 'Address must be between 5 and 200 characters' });
        }
        if (city.length < 2 || city.length > 100) {
            return res.status(400).json({ success: false, error: 'City must be between 2 and 100 characters' });
        }
        if (postalCode.length < 3 || postalCode.length > 20) {
            return res.status(400).json({ success: false, error: 'Postal code must be between 3 and 20 characters' });
        }
        if (country.length < 2 || country.length > 100) {
            return res.status(400).json({ success: false, error: 'Country must be between 2 and 100 characters' });
        }

        // Update user with personal info
        db.run(`
            UPDATE users SET
                first_name = ?,
                last_name = ?,
                address = ?,
                city = ?,
                postal_code = ?,
                country = ?,
                personal_info_completed = 1
            WHERE id = ?
        `, [firstName.trim(), lastName.trim(), address.trim(), city.trim(), postalCode.trim(), country.trim(), userId]);

        console.log(`📋 Personal info saved for user ${userId}`);

        res.json({
            success: true,
            message: 'Personal information saved successfully'
        });

    } catch (e) {
        console.error('Save personal info error:', e);
        res.status(500).json({ success: false, error: 'Failed to save personal info' });
    }
});

/**
 * GET /api/user/profile
 * Get complete user profile including personal info and withdrawal history
 */
app.get('/api/user/profile', verifyAuth, (req, res) => {
    try {
        const userId = req.user.uid;

        // Get user data with personal info
        const user = db.get(`
            SELECT 
                id, email, display_name, avatar_url,
                first_name, last_name, address, city, postal_code, country,
                balance, total_earned, total_withdrawn, personal_info_completed,
                created_at, first_withdrawal_at, referral_code
            FROM users WHERE id = ?
        `, [userId]);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Get withdrawal history (last 50)
        const withdrawals = db.all(`
            SELECT 
                id, reward_name, points_spent, status, 
                created_at, processed_at, admin_notes
            FROM withdrawals 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 50
        `, [userId]);

        console.log(`[PROFILE_DEBUG] UserID: ${userId}, Withdrawals found: ${withdrawals ? withdrawals.length : 0}`);
        if (withdrawals && withdrawals.length > 0) {
            console.log(`[PROFILE_DEBUG] First withdrawal:`, withdrawals[0]);
        }

        // Calculate account stats
        const stats = {
            accountAge: Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)), // days
            totalWithdrawals: withdrawals.length,
            pendingWithdrawals: withdrawals.filter(w => w.status === 'pending').length,
            completedWithdrawals: withdrawals.filter(w => w.status === 'approved').length,
            rejectedWithdrawals: withdrawals.filter(w => w.status === 'rejected').length
        };

        res.json({
            success: true,
            profile: {
                // Basic info
                email: user.email,
                displayName: user.display_name,
                avatarUrl: user.avatar_url,

                // Personal info (KYC)
                personalInfo: user.personal_info_completed ? {
                    firstName: user.first_name,
                    lastName: user.last_name,
                    address: user.address,
                    city: user.city,
                    postalCode: user.postal_code,
                    country: user.country
                } : null,
                personalInfoCompleted: !!user.personal_info_completed,

                // Account stats
                balance: user.balance,
                totalEarned: user.total_earned,
                totalWithdrawn: user.total_withdrawn,
                createdAt: user.created_at,
                firstWithdrawalAt: user.first_withdrawal_at,
                referralCode: user.referral_code,

                // Calculated stats
                stats: stats
            },

            // Withdrawal history
            withdrawals: withdrawals.map(w => ({
                id: w.id,
                rewardName: w.reward_name,
                pointsSpent: w.points_spent,
                status: w.status,
                createdAt: w.created_at,
                processedAt: w.processed_at,
                adminNote: w.admin_note
            }))
        });

    } catch (e) {
        console.error('Profile fetch error:', e);
        res.status(500).json({ success: false, error: 'Failed to load profile' });
    }
});


// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK & FALLBACK
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        firebaseConfigured: firebaseInitialized,
        rewardsLoaded: rewardsCatalog.brands.length
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// LEGAL PAGES API
// ═══════════════════════════════════════════════════════════════════════════

let legalContent = {};

function loadLegalContent() {
    try {
        const legalPath = path.join(__dirname, 'content', 'legal.json');
        if (fs.existsSync(legalPath)) {
            legalContent = JSON.parse(fs.readFileSync(legalPath, 'utf8'));
            console.log('⚖️  Loaded legal content');
        }
    } catch (error) {
        console.error('Failed to load legal.json:', error.message);
    }
}

/**
 * GET /api/legal/:page
 * Returns legal page content (terms-of-service, privacy-policy, cookie-policy, faq)
 * Query params:
 *   - lang: Language code ('en' or 'fr'), defaults to 'en'
 */
app.get('/api/legal/:page', (req, res) => {
    const page = req.params.page;
    const lang = req.query.lang || 'en'; // Default to English

    const pageContent = legalContent[page];

    if (!pageContent) {
        return res.status(404).json({ success: false, error: 'Page not found' });
    }

    // Get content for requested language, fallback to English if not available
    const content = pageContent[lang] || pageContent['en'];

    if (!content) {
        return res.status(404).json({ success: false, error: 'Content not available' });
    }

    res.json({ success: true, content: content });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOG API
// ═══════════════════════════════════════════════════════════════════════════

let blogContent = { articles: [], categories: [] };

function loadBlogContent() {
    try {
        const blogPath = path.join(__dirname, 'content', 'blog.json');
        if (fs.existsSync(blogPath)) {
            blogContent = JSON.parse(fs.readFileSync(blogPath, 'utf8'));
            console.log(`📝 Loaded ${blogContent.articles.length} blog articles`);
        }
    } catch (error) {
        console.error('Failed to load blog.json:', error.message);
    }
}

/**
 * GET /api/blog
 * Returns list of blog articles (without full content)
 */
app.get('/api/blog', (req, res) => {
    const { category } = req.query;

    let articles = blogContent.articles.map(a => ({
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt,
        category: a.category,
        author: a.author,
        date: a.date,
        readTime: a.readTime,
        image: a.image,
        tags: a.tags
    }));

    // Filter by category
    if (category && category !== 'all') {
        articles = articles.filter(a => a.category === category);
    }

    res.json({
        success: true,
        articles,
        categories: blogContent.categories
    });
});

/**
 * GET /api/blog/:slug
 * Returns single blog article with full content
 */
app.get('/api/blog/:slug', (req, res) => {
    const article = blogContent.articles.find(a => a.slug === req.params.slug);

    if (!article) {
        return res.status(404).json({ success: false, error: 'Article not found' });
    }

    // Get related articles (same category, exclude current)
    const related = blogContent.articles
        .filter(a => a.category === article.category && a.slug !== article.slug)
        .slice(0, 3)
        .map(a => ({ slug: a.slug, title: a.title, image: a.image }));

    res.json({ success: true, article, related });
});


/**
 * GET /api/status
 * Returns server status for the footer indicator
 */
app.get('/api/status', (req, res) => {
    res.json({
        status: 'operational',
        services: {
            database: true,
            offers: true,
            rewards: true
        },
        uptime: process.uptime()
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUPPORT TICKETS API (Bug Reports & Contact)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send Discord Webhook notification for new support tickets
 */
async function sendDiscordNotification(ticket) {
    if (!DISCORD_WEBHOOK_URL) return;

    try {
        const color = ticket.type === 'bug' ? 0xFF6B6B : 0x00D9FF; // Red for bugs, Cyan for contact
        const emoji = ticket.type === 'bug' ? '🐛' : '📩';

        const payload = {
            embeds: [{
                title: `${emoji} New ${ticket.type === 'bug' ? 'Bug Report' : 'Contact Message'}`,
                color: color,
                fields: [
                    { name: '📋 Subject', value: ticket.subject, inline: false },
                    { name: '📧 Email', value: ticket.email || 'Not provided', inline: true },
                    { name: '🆔 Ticket ID', value: `#${ticket.id}`, inline: true },
                    { name: '📝 Message', value: ticket.content.substring(0, 500) + (ticket.content.length > 500 ? '...' : ''), inline: false }
                ],
                footer: { text: 'LootQuest Support System' },
                timestamp: new Date().toISOString()
            }]
        };

        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log(`📨 Discord notification sent for ticket #${ticket.id}`);
    } catch (error) {
        console.error('Discord webhook error:', error.message);
    }
}

/**
 * POST /api/support/bug
 * Submit a bug report
 */
app.post('/api/support/bug', async (req, res) => {
    try {
        const { subject, content, email, browserInfo, pageUrl } = req.body;

        // Validation
        if (!subject || !content) {
            return res.status(400).json({
                success: false,
                error: 'Subject and description are required'
            });
        }

        if (subject.length < 5 || subject.length > 200) {
            return res.status(400).json({
                success: false,
                error: 'Subject must be between 5 and 200 characters'
            });
        }

        if (content.length < 20 || content.length > 5000) {
            return res.status(400).json({
                success: false,
                error: 'Description must be between 20 and 5000 characters'
            });
        }

        // Get user ID if authenticated
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.split('Bearer ')[1];
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.uid;
            } catch (e) { /* ignore */ }
        }

        // Insert ticket
        db.run(`
            INSERT INTO support_tickets (type, email, subject, content, user_id, browser_info, page_url)
            VALUES ('bug', ?, ?, ?, ?, ?, ?)
        `, [email || null, subject, content, userId, browserInfo || null, pageUrl || null]);

        // Get the inserted ticket ID
        const ticket = db.get('SELECT * FROM support_tickets ORDER BY id DESC LIMIT 1');

        console.log(`🐛 Bug Report #${ticket.id}: "${subject}"`);

        // Send Discord notification
        await sendDiscordNotification(ticket);

        res.status(201).json({
            success: true,
            message: 'Bug report submitted successfully. Thank you!',
            ticketId: ticket.id
        });

    } catch (error) {
        console.error('Bug report error:', error);
        res.status(500).json({ success: false, error: 'Failed to submit bug report' });
    }
});

/**
 * POST /api/support/contact
 * Submit a contact message
 */
app.post('/api/support/contact', async (req, res) => {
    try {
        const { email, subject, content } = req.body;

        // Validation
        if (!email || !subject || !content) {
            return res.status(400).json({
                success: false,
                error: 'Email, subject and message are required'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Please enter a valid email address'
            });
        }

        if (subject.length < 3 || subject.length > 200) {
            return res.status(400).json({
                success: false,
                error: 'Subject must be between 3 and 200 characters'
            });
        }

        if (content.length < 10 || content.length > 5000) {
            return res.status(400).json({
                success: false,
                error: 'Message must be between 10 and 5000 characters'
            });
        }

        // Get user ID if authenticated
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.split('Bearer ')[1];
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.uid;
            } catch (e) { /* ignore */ }
        }

        // Insert ticket
        db.run(`
            INSERT INTO support_tickets (type, email, subject, content, user_id)
            VALUES ('contact', ?, ?, ?, ?)
        `, [email, subject, content, userId]);

        // Get the inserted ticket ID
        const ticket = db.get('SELECT * FROM support_tickets ORDER BY id DESC LIMIT 1');

        console.log(`📩 Contact Message #${ticket.id}: "${subject}" from ${email}`);

        // Send Discord notification
        await sendDiscordNotification(ticket);

        res.status(201).json({
            success: true,
            message: 'Message sent successfully. We\'ll respond within 24-48 hours.',
            ticketId: ticket.id
        });

    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ success: false, error: 'Failed to send message' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BUG REPORTS API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/report
 * Submit a bug report (public, optionally authenticated)
 */
app.post('/api/report', async (req, res) => {
    try {
        const { category, title, description, browserInfo, pageUrl, email } = req.body;

        // Validation
        if (!category || !title || !description) {
            return res.status(400).json({
                success: false,
                error: 'Category, title and description are required'
            });
        }

        if (title.length < 5 || title.length > 200) {
            return res.status(400).json({
                success: false,
                error: 'Title must be between 5 and 200 characters'
            });
        }

        if (description.length < 20 || description.length > 5000) {
            return res.status(400).json({
                success: false,
                error: 'Description must be between 20 and 5000 characters'
            });
        }

        // Try to get user from token if provided
        let userId = null;
        let userEmail = email || null;

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split('Bearer ')[1];
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.uid;
                userEmail = decoded.email;
            } catch (e) {
                // Token invalid, continue as anonymous
            }
        }

        // Insert bug report
        db.run(`
            INSERT INTO bug_reports (user_id, user_email, category, title, description, browser_info, page_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [userId, userEmail, category, title, description, browserInfo || null, pageUrl || null]);

        console.log(`🐛 New bug report: "${title}" from ${userEmail || 'anonymous'}`);

        res.status(201).json({
            success: true,
            message: 'Bug report submitted successfully. Thank you for helping us improve!'
        });

    } catch (error) {
        console.error('Bug report error:', error);
        res.status(500).json({ success: false, error: 'Failed to submit bug report' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN PANEL API
// ═══════════════════════════════════════════════════════════════════════════

// Simple admin auth check (in production, use proper admin roles)
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'lootquest_admin_2024';

function verifyAdmin(req, res, next) {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== ADMIN_SECRET) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    next();
}

/**
 * GET /api/admin/reports
 * List all bug reports (admin only)
 */
app.get('/api/admin/reports', verifyAdmin, (req, res) => {
    try {
        const status = req.query.status || 'all';

        let sql = 'SELECT * FROM bug_reports ORDER BY created_at DESC';
        let params = [];

        if (status !== 'all') {
            sql = 'SELECT * FROM bug_reports WHERE status = ? ORDER BY created_at DESC';
            params = [status];
        }

        const reports = db.all(sql, params);

        // Get stats
        const stats = {
            total: db.get('SELECT COUNT(*) as count FROM bug_reports')?.count || 0,
            new: db.get("SELECT COUNT(*) as count FROM bug_reports WHERE status = 'new'")?.count || 0,
            in_progress: db.get("SELECT COUNT(*) as count FROM bug_reports WHERE status = 'in_progress'")?.count || 0,
            resolved: db.get("SELECT COUNT(*) as count FROM bug_reports WHERE status = 'resolved'")?.count || 0
        };

        res.json({ success: true, reports, stats });

    } catch (error) {
        console.error('Admin reports error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch reports' });
    }
});

/**
 * PATCH /api/admin/reports/:id
 * Update bug report status (admin only)
 */
app.patch('/api/admin/reports/:id', verifyAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminNotes } = req.body;

        const report = db.get('SELECT * FROM bug_reports WHERE id = ?', [id]);
        if (!report) {
            return res.status(404).json({ success: false, error: 'Report not found' });
        }

        const validStatuses = ['new', 'in_progress', 'resolved', 'wont_fix'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        if (status) {
            db.run('UPDATE bug_reports SET status = ? WHERE id = ?', [status, id]);
            if (status === 'resolved') {
                db.run("UPDATE bug_reports SET resolved_at = datetime('now') WHERE id = ?", [id]);
            }
        }

        if (adminNotes !== undefined) {
            db.run('UPDATE bug_reports SET admin_notes = ? WHERE id = ?', [adminNotes, id]);
        }

        const updated = db.get('SELECT * FROM bug_reports WHERE id = ?', [id]);
        res.json({ success: true, report: updated });

    } catch (error) {
        console.error('Update report error:', error);
        res.status(500).json({ success: false, error: 'Failed to update report' });
    }
});

/**
 * DELETE /api/admin/reports/:id
 * Delete a bug report (admin only)
 */
app.delete('/api/admin/reports/:id', verifyAdmin, (req, res) => {
    try {
        const { id } = req.params;

        const report = db.get('SELECT * FROM bug_reports WHERE id = ?', [id]);
        if (!report) {
            return res.status(404).json({ success: false, error: 'Report not found' });
        }

        db.run('DELETE FROM bug_reports WHERE id = ?', [id]);
        res.json({ success: true, message: 'Report deleted' });

    } catch (error) {
        console.error('Delete report error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete report' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SEO ANALYTICS API ROUTES (Admin Only)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/analytics/stats
 * Global analytics statistics
 */
app.get('/api/admin/analytics/stats', isAuthenticated, requireAdmin, (req, res) => {
    try {
        const totalVisits = db.get('SELECT COUNT(*) as count FROM analytics_visits WHERE device_type != "bot"');
        const totalVisitsToday = db.get(`
            SELECT COUNT(*) as count 
            FROM analytics_visits 
            WHERE device_type != 'bot' 
            AND DATE(timestamp) = DATE('now')
        `);

        const uniqueVisitors = db.get(`
            SELECT COUNT(DISTINCT visitor_ip_hash) as count 
            FROM analytics_visits 
            WHERE device_type != 'bot'
        `);

        const topPage = db.get(`
            SELECT page_url, COUNT(*) as visits
            FROM analytics_visits
            WHERE device_type != 'bot'
            GROUP BY page_url
            ORDER BY visits DESC
            LIMIT 1
        `);

        res.json({
            success: true,
            stats: {
                totalVisits: totalVisits?.count || 0,
                totalVisitsToday: totalVisitsToday?.count || 0,
                uniqueVisitors: uniqueVisitors?.count || 0,
                topPage: topPage || null
            }
        });
    } catch (error) {
        console.error('Analytics stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/analytics/timeline
 * Daily visits over last 30 days
 */
app.get('/api/admin/analytics/timeline', isAuthenticated, requireAdmin, (req, res) => {
    try {
        const timeline = db.all(`
            SELECT DATE(timestamp) as date, COUNT(*) as visits
            FROM analytics_visits
            WHERE device_type != 'bot'
            AND timestamp >= datetime('now', '-30 days')
            GROUP BY DATE(timestamp)
            ORDER BY date ASC
        `);

        res.json({ success: true, timeline });
    } catch (error) {
        console.error('Analytics timeline error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/analytics/peak-hours
 * Hourly traffic distribution (last 7 days)
 */
app.get('/api/admin/analytics/peak-hours', isAuthenticated, requireAdmin, (req, res) => {
    try {
        const peakHours = db.all(`
            SELECT 
                CAST(strftime('%H', timestamp) AS INTEGER) as hour,
                COUNT(*) as visits
            FROM analytics_visits
            WHERE device_type != 'bot'
            AND timestamp >= datetime('now', '-7 days')
            GROUP BY hour
            ORDER BY hour ASC
        `);

        res.json({ success: true, peakHours });
    } catch (error) {
        console.error('Analytics peak hours error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/analytics/top-blogs
 * Top 10 most visited blog articles (last 7 days)
 */
app.get('/api/admin/analytics/top-blogs', isAuthenticated, requireAdmin, (req, res) => {
    try {
        const topBlogs = db.all(`
            SELECT 
                blog_slug,
                page_url,
                COUNT(*) as total_views,
                COUNT(DISTINCT visitor_ip_hash) as unique_views
            FROM analytics_visits
            WHERE device_type != 'bot'
            AND blog_slug IS NOT NULL
            AND timestamp >= datetime('now', '-7 days')
            GROUP BY blog_slug
            ORDER BY total_views DESC
            LIMIT 10
        `);

        res.json({ success: true, topBlogs });
    } catch (error) {
        console.error('Analytics top blogs error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/analytics/traffic-sources
 * Traffic source breakdown (direct, google, social, other)
 */
app.get('/api/admin/analytics/traffic-sources', isAuthenticated, requireAdmin, (req, res) => {
    try {
        const sources = db.all(`
            SELECT 
                referer_category,
                COUNT(*) as visits,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM analytics_visits WHERE device_type != 'bot'), 2) as percentage
            FROM analytics_visits
            WHERE device_type != 'bot'
            GROUP BY referer_category
            ORDER BY visits DESC
        `);

        res.json({ success: true, sources });
    } catch (error) {
        console.error('Analytics traffic sources error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/analytics/devices
 * Device type breakdown (mobile, desktop, tablet)
 */
app.get('/api/admin/analytics/devices', isAuthenticated, requireAdmin, (req, res) => {
    try {
        const devices = db.all(`
            SELECT 
                device_type,
                COUNT(*) as visits,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM analytics_visits WHERE device_type != 'bot'), 2) as percentage
            FROM analytics_visits
            WHERE device_type != 'bot'
            GROUP BY device_type
            ORDER BY visits DESC
        `);

        res.json({ success: true, devices });
    } catch (error) {
        console.error('Analytics devices error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

async function startServer() {
    // Initialize database
    await db.init();

    // Initialize Firebase
    initFirebase();

    // Load rewards
    loadRewards();

    // Load content
    loadLegalContent();
    loadBlogContent();

    // Start Express server
    app.listen(PORT, () => {
        console.log('═══════════════════════════════════════════════════════════════════');
        console.log('   🎮 LootQuest Server Started');
        console.log('═══════════════════════════════════════════════════════════════════');
        console.log(`   📍 URL: http://localhost:${PORT}`);
        console.log(`   🗄️  Database: ${db.dbPath}`);
        console.log(`   🔥 Firebase: ${firebaseInitialized ? 'Configured ✅' : 'Not configured ⚠️'}`);
        console.log(`   🎁 Rewards: ${rewardsCatalog.brands ? rewardsCatalog.brands.length : 0} brands loaded`);
        console.log(`   📝 Blog: ${blogContent.articles.length} articles loaded`);
        console.log('═══════════════════════════════════════════════════════════════════');
        console.log('');
        console.log('   Postback URL for Lootably:');
        console.log(`   https://yourdomain.com/api/postback/lootably?user_id={user_id}&payout={payout}&transaction_id={transaction_id}&secret=${LOOTABLY_SECRET}`);
        console.log('');

        // Signal PM2 that the application is ready
        if (process.send) {
            process.send('ready');
            console.log('   ✅ Sent ready signal to PM2');
        }
    });
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down gracefully...');
    db.close();
    process.exit(0);
});

// Start the server
startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
