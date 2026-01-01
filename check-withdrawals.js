const Database = require('better-sqlite3');
const db = new Database('./database.db');

console.log('🔍 Checking withdrawal data...\n');

// Get all users with their emails
console.log('=== ALL USERS ===');
const users = db.prepare('SELECT id, email, display_name, balance FROM users').all();
users.forEach(u => {
    console.log(`ID: ${u.id.substring(0, 20)}... | Email: ${u.email} | Balance: ${u.balance}`);
});

console.log('\n=== ALL WITHDRAWALS ===');
const withdrawals = db.prepare(`
    SELECT w.*, u.email 
    FROM withdrawals w 
    JOIN users u ON w.user_id = u.id 
    ORDER BY w.created_at DESC
`).all();

if (withdrawals.length === 0) {
    console.log('❌ NO WITHDRAWALS FOUND IN DATABASE');
} else {
    withdrawals.forEach(w => {
        console.log(`\nWithdrawal ID: ${w.id}`);
        console.log(`  User: ${w.email}`);
        console.log(`  Reward: ${w.reward_name}`);
        console.log(`  Points: ${w.points_spent}`);
        console.log(`  Status: ${w.status}`);
        console.log(`  Created: ${w.created_at}`);
        console.log(`  Processed: ${w.processed_at || 'N/A'}`);
    });
}

console.log('\n=== PENDING WITHDRAWALS ===');
const pending = db.prepare("SELECT * FROM withdrawals WHERE status = 'pending'").all();
console.log(`Found ${pending.length} pending withdrawal(s)`);

db.close();
