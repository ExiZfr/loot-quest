/**
 * Clean Reload of LootQuest App
 */

const { Client } = require('ssh2');

const conn = new Client();

console.log('═══════════════════════════════════════════════════════════');
console.log('   🔄 Reloading LootQuest Application');
console.log('═══════════════════════════════════════════════════════════\n');

conn.on('ready', () => {
    const commands = [
        'cd /var/www/lootquest',
        'git pull origin master',
        'npm install --production',
        'pm2 reload ecosystem.config.js --env production',
        'echo "Waiting for app to stabilize (15s)..."',
        'sleep 15',
        'pm2 status',
        'pm2 logs lootquest --lines 20 --nostream'
    ];

    conn.exec(commands.join(' && '), { pty: true }, (err, stream) => {
        if (err) throw err;

        stream.on('data', (data) => {
            process.stdout.write(data.toString());
        });

        stream.on('close', (code) => {
            console.log('\n═══════════════════════════════════════════════════════════');
            if (code === 0 || code === null) {
                console.log('   ✅ Application Reloaded Successfully!');
            } else {
                console.log(`   ⚠️  Exit code: ${code}`);
            }
            conn.end();
        });
    });

}).connect({
    host: '82.165.138.12',
    port: 22,
    username: 'root',
    password: '7GYMO97a'
});
