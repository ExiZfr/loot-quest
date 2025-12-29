const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function grantAdminPoints() {
    console.log('🔄 Connecting to database...');

    const SQL = await initSqlJs();
    const dbPath = path.join(__dirname, 'data', 'pixelrewards.db'); // server.js root

    if (!fs.existsSync(dbPath)) {
        console.error('❌ Database not found at:', dbPath);
        process.exit(1);
    }

    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);

    // Find User
    const searchName = 'ExiZ Binks';
    console.log(`🔍 Searching for user: "${searchName}"...`);

    // Check discord_username
    // Using a simple query since we can't do LIKE easily with params in some sql.js versions without preparing
    // But standard SQL works.
    const stmt = db.prepare("SELECT * FROM users WHERE discord_username LIKE ? OR display_name LIKE ?");
    stmt.bind([`%${searchName}%`, `%${searchName}%`]);

    let user = null;
    if (stmt.step()) {
        user = stmt.getAsObject();
    }
    stmt.free();

    if (!user) {
        console.error('❌ User not found! Please ensure you have logged in at least once.');
        console.log('   (Found no match for "ExiZ Binks" in discord_username or display_name)');
        process.exit(1);
    }

    console.log(`✅ User found: ${user.display_name} (ID: ${user.id})`);
    console.log(`   Current Balance: ${user.balance}`);

    // Update Balance
    const NEW_BALANCE = 1000000000;
    console.log(`💰 Setting balance to ${NEW_BALANCE}...`);

    db.run("UPDATE users SET balance = ? WHERE id = ?", [NEW_BALANCE, user.id]);

    // Save Database
    const data = db.export();
    const bufferToWrite = Buffer.from(data);
    fs.writeFileSync(dbPath, bufferToWrite);

    console.log('✅ Database updated successfully!');
    console.log(`🚀 ${user.display_name} now has 1,000,000,000 points.`);
}

grantAdminPoints();
