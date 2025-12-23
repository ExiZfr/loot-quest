/**
 * Start LootQuest application on VPS
 */

const { Client } = require('ssh2');

const conn = new Client();

console.log('═══════════════════════════════════════════════════════════');
console.log('   🚀 Starting LootQuest on VPS');
console.log('═══════════════════════════════════════════════════════════\n');

conn.on('ready', () => {
    const commands = [
        'cd /var/www/lootquest',
        'cp .env.example .env',
        'npm install --production 2>&1 | tail -20',
        'pm2 delete lootquest 2>/dev/null || true',
        'pm2 start ecosystem.config.js --env production',
        'pm2 save',
        'pm2 status'
    ];

    conn.exec(commands.join(' && '), { pty: true }, (err, stream) => {
        if (err) throw err;

        stream.on('data', (data) => {
            process.stdout.write(data.toString());
        });

        stream.on('close', (code) => {
            console.log('\n═══════════════════════════════════════════════════════════');
            if (code === 0 || code === null) {
                console.log('   ✅ Application Started!');
                console.log('═══════════════════════════════════════════════════════════');
                console.log('\n   🌐 Application: http://82.165.138.12:3000');
                console.log('   📊 PM2 Status: ssh root@82.165.138.12 "pm2 status"');
                console.log('   📝 Logs: ssh root@82.165.138.12 "pm2 logs lootquest"');
                console.log('\n   Next steps:');
                console.log('   1. Configure .env on VPS with secrets');
                console.log('   2. Setup Nginx reverse proxy');
                console.log('   3. Configure domain + SSL (certbot)');
            } else {
                console.log(`   Exit code: ${code}`);
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
