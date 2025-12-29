const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function checkWithdrawals() {
    const SQL = await initSqlJs();
    const dbPath = path.join(__dirname, 'data', 'pixelrewards.db');

    if (!fs.existsSync(dbPath)) {
        console.error('❌ Database not found');
        process.exit(1);
    }

    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);

    console.log('\n📦 PENDING WITHDRAWALS LOG');
    console.log('════════════════════════════════════════════════════════');

    const stmt = db.prepare(`
        SELECT w.id, w.reward_name, w.points_spent, w.status, w.created_at, u.display_name, u.email 
        FROM withdrawals w
        JOIN users u ON w.user_id = u.id
        WHERE w.status = 'pending'
        ORDER BY w.created_at DESC
    `);

    let count = 0;
    while (stmt.step()) {
        const row = stmt.getAsObject();
        console.log(`[#${row.id}] ${row.created_at}`);
        console.log(`   👤 User: ${row.display_name} (${row.email})`);
        console.log(`   🎁 Reward: ${row.reward_name}`);
        console.log(`   💎 Cost: ${row.points_spent} pts`);
        console.log(`   tum Status: ${row.status}`);
        console.log('────────────────────────────────────────────────────────');
        count++;
    }
    stmt.free();

    if (count === 0) {
        console.log('   No pending withdrawals found.');
    } else {
        console.log(`   Total Pending: ${count}`);
    }
    console.log('════════════════════════════════════════════════════════\n');
}

checkWithdrawals();
