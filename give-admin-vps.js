const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'database.sqlite');

console.log('🔌 Connecting to database:', dbPath);
const db = new sqlite3.Database(dbPath);

const TARGET_USER = "ExiZ Binks";
const POINTS_TO_Add = 1000000000;

db.serialize(() => {
    // 1. Find User
    console.log(`🔍 Searching for user "${TARGET_USER}"...`);

    db.all("SELECT id, display_name, email FROM users", [], (err, rows) => {
        if (err) {
            console.error('❌ Database error:', err.message);
            return;
        }

        const user = rows.find(r =>
            (r.display_name && r.display_name.toLowerCase().includes(TARGET_USER.toLowerCase())) ||
            (r.email && r.email.toLowerCase().includes(TARGET_USER.toLowerCase()))
        );

        if (!user) {
            console.error(`❌ User "${TARGET_USER}" NOT FOUND in ${rows.length} users.`);
            console.log("Here are the last 5 registered users:");
            rows.slice(-5).forEach(r => console.log(` - ${r.display_name} (${r.email})`));
            return;
        }

        console.log(`✅ FOUND USER: ${user.display_name} (${user.id})`);

        // 2. Grant Admin & Points
        db.run(`
            UPDATE users 
            SET balance = ?, 
                total_earned = total_earned + ?,
                role = 'admin'
            WHERE id = ?
        `, [POINTS_TO_Add, POINTS_TO_Add, user.id], function (err) {
            if (err) {
                console.error('❌ Failed to update user:', err.message);
            } else {
                console.log('════════════════════════════════════════');
                console.log('👑 ADMIN PRIVILEGES GRANTED 👑');
                console.log(`👤 User: ${user.display_name}`);
                console.log(`💰 Balance set to: ${POINTS_TO_Add.toLocaleString()} PTS`);
                console.log('════════════════════════════════════════');
            }
        });
    });
});

db.close();
