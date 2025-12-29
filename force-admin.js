const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'data', 'pixelrewards.db');
const TARGET_USER = "ExiZ Binks";
const POINTS = 1000000000;

async function run() {
    console.log('🔍 DIAGNOSTIC ADMIN SCRIPT');
    console.log('='.repeat(50));

    if (!fs.existsSync(DB_PATH)) {
        console.error('❌ Database not found:', DB_PATH);
        process.exit(1);
    }

    try {
        const SQL = await initSqlJs();
        const buffer = fs.readFileSync(DB_PATH);
        const db = new SQL.Database(buffer);

        // 1. FIND USER
        console.log(`\n🔍 Searching for user "${TARGET_USER}"...`);
        const stmt = db.prepare("SELECT * FROM users");
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
            console.error(`❌ User "${TARGET_USER}" NOT FOUND`);
            process.exit(1);
        }

        console.log(`\n✅ FOUND USER:`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Display Name: ${user.display_name}`);
        console.log(`   Current Balance: ${user.balance || 0}`);
        console.log(`   Current Role: ${user.role || '(null)'}`);

        // 2. ENSURE COLUMN EXISTS
        try {
            db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
            console.log('\n⚠️  Added role column');
        } catch (e) {
            console.log('\n✅ role column already exists');
        }

        // 3. FORCE UPDATE
        console.log(`\n💾 FORCING UPDATE...`);
        db.run(`
            UPDATE users 
            SET balance = ?,
                total_earned = ?,
                role = 'admin'
            WHERE id = ?
        `, [POINTS, POINTS, user.id]);

        // 4. VERIFY UPDATE
        const verifyStmt = db.prepare("SELECT id, email, display_name, balance, total_earned, role FROM users WHERE id = ?");
        verifyStmt.bind([user.id]);

        if (verifyStmt.step()) {
            const updated = verifyStmt.getAsObject();
            console.log(`\n✅ VERIFICATION AFTER UPDATE:`);
            console.log(`   Balance: ${updated.balance}`);
            console.log(`   Total Earned: ${updated.total_earned}`);
            console.log(`   Role: ${updated.role}`);

            if (updated.role !== 'admin') {
                console.error('\n❌ WARNING: Role update failed!');
            } else if (updated.balance != POINTS) {
                console.error('\n❌ WARNING: Balance update failed!');
            } else {
                console.log(`\n✅✅✅ ALL UPDATES SUCCESSFUL!`);
            }
        }
        verifyStmt.free();

        // 5. SAVE
        const data = db.export();
        const bufferToWrite = Buffer.from(data);
        fs.writeFileSync(DB_PATH, bufferToWrite);

        console.log('\n' + '='.repeat(50));
        console.log('💾 DATABASE SAVED SUCCESSFULLY');
        console.log('='.repeat(50));

        db.close();

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

run();
