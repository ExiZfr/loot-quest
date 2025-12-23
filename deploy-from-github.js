/**
 * Quick VPS Deployment from GitHub
 */

const { Client } = require('ssh2');

const conn = new Client();

console.log('═══════════════════════════════════════════════════════════');
console.log('   🚀 LootQuest GitHub → VPS Deployment');
console.log('═══════════════════════════════════════════════════════════\n');

conn.on('ready', () => {
    console.log('✅ Connected to VPS\n');

    const commands = [
        'cd /var/www',
        'rm -rf lootquest',
        'git clone https://github.com/imir-b/loot-quest.git lootquest',
        'cd lootquest',
        'bash scripts/deploy.sh 2>&1'
    ];

    const fullCommand = commands.join(' && ');

    console.log('🔄 Executing deployment...\n');

    conn.exec(fullCommand, { pty: true }, (err, stream) => {
        if (err) throw err;

        stream.on('data', (data) => {
            process.stdout.write(data.toString());
        });

        stream.stderr.on('data', (data) => {
            process.stderr.write(data.toString());
        });

        stream.on('close', (code) => {
            console.log('\n═══════════════════════════════════════════════════════════');
            if (code === 0 || code === null) {
                console.log('   ✅ Deployment Complete!');
                console.log('═══════════════════════════════════════════════════════════');
                console.log('\n   🌐 Application: http://82.165.138.12:3000');
                console.log('   📊 PM2 Status: ssh root@82.165.138.12 "pm2 status"');
                console.log('   📝 Logs: ssh root@82.165.138.12 "pm2 logs"');
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

conn.on('error', (err) => {
    console.error('❌ SSH Error:', err.message);
    process.exit(1);
});
