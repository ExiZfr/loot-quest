const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'database.sqlite');

console.log('🔌 Connecting to database:', dbPath);

// Initialize DB
let db;
try {
    db = new Database(dbPath);
} catch (e) {
    console.error("❌ Failed to open database. Check path or permissions.", e);
    process.exit(1);
}

const TARGET_USER = "ExiZ Binks";
const POINTS_TO_ADD = 1000000000;

try {
    // 1. Find User
    console.log(`🔍 Searching for user "${TARGET_USER}"...`);

    const users = db.prepare("SELECT id, display_name, email FROM users").all();

    const user = users.find(r =>
        (r.display_name && r.display_name.toLowerCase().includes(TARGET_USER.toLowerCase())) ||
        (r.email && r.email.toLowerCase().includes(TARGET_USER.toLowerCase()))
    );

    if (!user) {
        console.error(`❌ User "${TARGET_USER}" NOT FOUND in ${users.length} users.`);
        console.log("Here are the last 5 registered users:");
        users.slice(-5).forEach(r => console.log(` - ${r.display_name} (${r.email})`));
        db.close();
        process.exit(0);
    }

    console.log(`✅ FOUND USER: ${user.display_name} (${user.id})`);

    // 2. Grant Admin & Points
    const updateStmt = db.prepare(`
        UPDATE users 
        SET balance = ?, 
            total_earned = total_earned + ?,
            role = 'admin'
        WHERE id = ?
    `);

    const info = updateStmt.run(POINTS_TO_ADD, POINTS_TO_ADD, user.id);

    if (info.changes > 0) {
        console.log('════════════════════════════════════════');
        console.log('👑 ADMIN PRIVILEGES GRANTED 👑');
        console.log(`👤 User: ${user.display_name}`);
        console.log(`💰 Balance set to: ${POINTS_TO_ADD.toLocaleString()} PTS`);
        console.log('════════════════════════════════════════');
    } else {
        console.error('❌ Failed to update user (No changes made)');
    }

} catch (error) {
    console.error('❌ Script error:', error.message);
} finally {
    db.close();
}
