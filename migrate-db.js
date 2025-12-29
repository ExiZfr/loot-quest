const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'data', 'pixelrewards.db');

async function migrate() {
    console.log('🔧 DATABASE MIGRATION SCRIPT');
    console.log('='.repeat(60));

    if (!fs.existsSync(DB_PATH)) {
        console.error('❌ Database not found:', DB_PATH);
        process.exit(1);
    }

    try {
        const SQL = await initSqlJs();
        const buffer = fs.readFileSync(DB_PATH);
        const db = new SQL.Database(buffer);

        console.log('\n📊 STEP 1: Checking current schema...');

        // Check if role column exists
        const tableInfo = db.exec("PRAGMA table_info(users)");
        const columns = tableInfo[0]?.values || [];
        const hasRoleColumn = columns.some(col => col[1] === 'role');

        if (hasRoleColumn) {
            console.log('✅ Column "role" already exists');
        } else {
            console.log('⚠️  Column "role" does NOT exist - creating new table...');

            // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
            console.log('\n📊 STEP 2: Creating new table with role column...');

            // Get all existing data
            const users = db.exec("SELECT * FROM users");

            // Rename old table
            db.run("ALTER TABLE users RENAME TO users_old");

            // Create new table with role column
            db.run(`
                CREATE TABLE users (
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
                    last_login_at DATETIME,
                    referral_code TEXT UNIQUE,
                    referred_by_user_id TEXT,
                    ip_address TEXT,
                    lifetime_earnings INTEGER DEFAULT 0,
                    referral_unlocked INTEGER DEFAULT 0
                )
            `);

            console.log('✅ New table created');

            console.log('\n📊 STEP 3: Migrating existing data...');

            // Copy data from old table to new table
            db.run(`
                INSERT INTO users 
                SELECT 
                    id, email, password_hash, display_name, avatar_url, 
                    provider, firebase_uid, discord_id, discord_username, discord_avatar,
                    balance, total_earned, total_withdrawn,
                    'user' as role,
                    created_at, first_withdrawal_at, last_login_at,
                    referral_code, referred_by_user_id, ip_address,
                    lifetime_earnings, referral_unlocked
                FROM users_old
            `);

            const migratedCount = db.exec("SELECT COUNT(*) as c FROM users")[0].values[0][0];
            console.log(`✅ Migrated ${migratedCount} users`);

            // Drop old table
            db.run("DROP TABLE users_old");
            console.log('✅ Cleanup complete');
        }

        console.log('\n📊 STEP 4: Setting up admin user...');

        // Find ExiZ Binks
        const userResult = db.exec("SELECT * FROM users WHERE email LIKE '%exizfr%'");

        if (!userResult[0] || !userResult[0].values[0]) {
            console.error('❌ User "ExiZ Binks" not found');
            process.exit(1);
        }

        const userId = userResult[0].values[0][0]; // First column is ID
        console.log(`✅ Found user: ${userId}`);

        // Update user to admin with 1 billion points
        db.run(`
            UPDATE users 
            SET balance = 1000000000,
                total_earned = 1000000000,
                role = 'admin'
            WHERE id = ?
        `, [userId]);

        console.log('✅ Admin privileges granted');
        console.log('✅ Balance set to 1,000,000,000 PTS');

        // Verify
        const verifyResult = db.exec(`SELECT email, balance, role FROM users WHERE id = '${userId}'`);
        const [email, balance, role] = verifyResult[0].values[0];

        console.log('\n📊 VERIFICATION:');
        console.log(`   Email: ${email}`);
        console.log(`   Balance: ${balance.toLocaleString()} PTS`);
        console.log(`   Role: ${role}`);

        // Save database
        const data = db.export();
        const bufferToWrite = Buffer.from(data);
        fs.writeFileSync(DB_PATH, bufferToWrite);

        console.log('\n' + '='.repeat(60));
        console.log('✅ ✅ ✅  MIGRATION COMPLETE  ✅ ✅ ✅');
        console.log('='.repeat(60));
        console.log('\nNow restart the server with: pm2 restart lootquest');

        db.close();

    } catch (error) {
        console.error('❌ Migration error:', error);
        process.exit(1);
    }
}

migrate();
