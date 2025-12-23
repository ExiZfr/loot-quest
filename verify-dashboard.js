/**
 * Verify Dashboard Accessibility
 */

const { Client } = require('ssh2');

const conn = new Client();

console.log('Verifying Dashboard...\n');

conn.on('ready', () => {
    const commands = [
        // Check file existence
        'ls -la /var/www/lootquest/public/dashboard.html',

        // Check if accessible via HTTP
        'curl -s -I https://loot-quest.fr/dashboard.html'
    ];

    conn.exec(commands.join(' && '), { pty: true }, (err, stream) => {
        if (err) throw err;

        stream.on('data', (data) => {
            process.stdout.write(data.toString());
        });

        stream.on('close', (code) => {
            conn.end();
            if (code === 0) {
                console.log('\n✅ Dashboard is live!');
            }
        });
    });

}).connect({
    host: '82.165.138.12',
    port: 22,
    username: 'root',
    password: '7GYMO97a'
});
