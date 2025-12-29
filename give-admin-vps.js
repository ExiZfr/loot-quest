const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'data', 'pixelrewards.db');
const TARGET_USER = "ExiZ Binks";
const POINTS_TO_ADD = 1000000000;

async function run() {
    console.log('🔌 Loading database from:', DB_PATH);

    if (!fs.existsSync(DB_PATH)) {
        console.error('❌ Database file not found at:', DB_PATH);
        process.exit(1);
    }

    try {
        const SQL = await initSqlJs();
        const buffer = fs.readFileSync(DB_PATH);
        const db = new SQL.Database(buffer);

        // 1. Find User
        console.log(`🔍 Searching for user "${TARGET_USER}"...`);

        // Get all users to search (sql.js doesn't support LIKE comfortably in prepared without binding)
        const stmt = db.prepare("SELECT id, display_name, email FROM users");
        let user = null;

        while (stmt.step()) {
            const row = stmt.getAsObject();
            if (
                (row.display_name && row.display_name.toLowerCase().includes(TARGET_USER.toLowerCase())) ||
                (row.email && row.email.toLowerCase().includes(TARGET_USER.toLowerCase()))
            ) {
                user = row;
                break;
            }
        }
        stmt.free();

        if (!user) {
            console.error(`❌ User "${TARGET_USER}" NOT FOUND.`);
            // List last 5 users
            console.log("Here are the last 5 registered users:");
            const logs = db.exec("SELECT display_name, email FROM users ORDER BY id DESC LIMIT 5");
            if (logs.length > 0 && logs[0].values) {
                logs[0].values.forEach(v => console.log(` - ${v[0]} (${v[1]})`));
            }
            process.exit(0);
        }

        console.log(`✅ FOUND USER: ${user.display_name} (${user.id})`);

        // 2. Grant Admin & Points
        console.log(`💰 Adding ${POINTS_TO_ADD.toLocaleString()} points and Admin role...`);

        db.run(`
            UPDATE users 
            SET balance = ?, 
                total_earned = total_earned + ?,
                role = 'admin'
            WHERE id = ?
        `, [POINTS_TO_ADD, POINTS_TO_ADD, user.id]);

        // 3. SAVE CHANGES (Critical for sql.js)
        const data = db.export();
        const bufferToWrite = Buffer.from(data);
        fs.writeFileSync(DB_PATH, bufferToWrite);

        console.log('════════════════════════════════════════');
        console.log('💾 DATABASE SAVED SUCCESSFULLY');
        console.log('👑 ADMIN PRIVILEGES GRANTED 👑');
        console.log(`👤 User: ${user.display_name}`);
        console.log(`💰 Balance set to: ${POINTS_TO_ADD.toLocaleString()} PTS`);
        console.log('════════════════════════════════════════');

        db.close();

    } catch (error) {
        console.error('❌ Script error:', error);
    }
}

run();
