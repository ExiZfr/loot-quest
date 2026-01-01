/**
 * Migration script to add missing columns to withdrawals table
 * Run this on the VPS to fix the withdrawal system
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'pixelrewards.db');
const db = new Database(dbPath);

console.log('🔧 Fixing withdrawals table...\n');

try {
    // Add missing columns
    console.log('Adding request_ip column...');
    try {
        db.exec('ALTER TABLE withdrawals ADD COLUMN request_ip TEXT');
        console.log('✅ Added request_ip column');
    } catch (e) {
        if (e.message.includes('duplicate column')) {
            console.log('ℹ️  request_ip column already exists');
        } else {
            throw e;
        }
    }

    console.log('Adding request_user_agent column...');
    try {
        db.exec('ALTER TABLE withdrawals ADD COLUMN request_user_agent TEXT');
        console.log('✅ Added request_user_agent column');
    } catch (e) {
        if (e.message.includes('duplicate column')) {
            console.log('ℹ️  request_user_agent column already exists');
        } else {
            throw e;
        }
    }

    console.log('Adding admin_notes column...');
    try {
        db.exec('ALTER TABLE withdrawals ADD COLUMN admin_notes TEXT');
        console.log('✅ Added admin_notes column');
    } catch (e) {
        if (e.message.includes('duplicate column')) {
            console.log('ℹ️  admin_notes column already exists');
        } else {
            throw e;
        }
    }

    // Verify the schema
    console.log('\n📋 Current withdrawals table schema:');
    const schema = db.prepare("PRAGMA table_info(withdrawals)").all();
    schema.forEach(col => {
        console.log(`  - ${col.name} (${col.type})`);
    });

    console.log('\n✅ Migration completed successfully!');
    console.log('You can now restart the server: pm2 restart lootquest');

} catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
} finally {
    db.close();
}
