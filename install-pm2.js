/**
 * Install PM2 and start app
 */

const { Client } = require('ssh2');

const conn = new Client();

console.log('Installing PM2 and starting app...\n');

conn.on('ready', () => {
    const commands = [
        'npm install -g pm2',
        'cd /var/www/lootquest',
        'pm2 delete lootquest 2>/dev/null || true',
        'pm2 start ecosystem.config.js --env production',
        'pm2 save',
        'pm2 startup',
        'pm2 list'
    ];

    conn.exec(commands.join(' && '), { pty: true }, (err, stream) => {
        if (err) throw err;

        stream.on('data', (data) => {
            process.stdout.write(data.toString());
        });

        stream.on('close', (code) => {
            console.log('\n═══════════════════════════════════════════════════════════');
            console.log('   ✅ Deployment Complete!');
            console.log('═══════════════════════════════════════════════════════════');
            console.log('\n   🌐 http://82.165.138.12:3000');
            console.log('   📊 ssh root@82.165.138.12 "pm2 status"');
            conn.end();
        });
    });

}).connect({
    host: '82.165.138.12',
    port: 22,
    username: 'root',
    password: '7GYMO97a'
});
