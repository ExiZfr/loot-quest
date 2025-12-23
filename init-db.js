/**
 * PixelRewards - Database Initialization Script
 * 
 * This script creates the SQLite database schema for the PixelRewards platform.
 * Run with: node init-db.js
 * 
 * Tables created:
 * - users: User profiles synced from Firebase
 * - transactions: Points earning/spending history
 * - withdrawals: Reward redemption requests
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

async function initDatabase() {
    // Ensure data directory exists
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('📁 Created data directory');
    }

    const dbPath = path.join(dataDir, 'pixelrewards.db');

    console.log('🗄️  Initializing PixelRewards database...\n');

    // Initialize SQL.js
    const SQL = await initSqlJs();

    // Load existing database or create new one
    let db;
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
        console.log('📂 Loaded existing database');
    } else {
        db = new SQL.Database();
        console.log('✨ Creating new database');
    }

    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');

    // Create users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT,
            avatar_url TEXT,
            provider TEXT,
            balance INTEGER DEFAULT 0 CHECK(balance >= 0),
            total_earned INTEGER DEFAULT 0,
            total_withdrawn INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            first_withdrawal_at DATETIME,
            last_login_at DATETIME
        )
    `);
    console.log('✅ Created table: users');

    // Create transactions table
    db.run(`
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
    console.log('✅ Created table: transactions');

    // Create withdrawals table
    db.run(`
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
    console.log('✅ Created table: withdrawals');

    // Create indexes
    db.run('CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)');
    db.run('CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    console.log('✅ Created indexes');

    // Save database to file
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);

    // Verify tables
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log('\n📊 Database tables:');
    if (tables.length > 0 && tables[0].values) {
        tables[0].values.forEach(t => console.log(`   - ${t[0]}`));
    }

    db.close();

    console.log(`\n🎉 Database initialized successfully at: ${dbPath}`);
    console.log('\nYou can now start the server with: npm start');
}

initDatabase().catch(console.error);
