/**
 * Check PM2 status and logs on VPS
 */

const { Client } = require('ssh2');

const conn = new Client();

console.log('Checking PM2 status...\n');

conn.on('ready', () => {
    // Check status and get last 50 lines of logs
    const cmd = 'pm2 status && echo "\n=== LOGS ===\n" && pm2 logs lootquest --lines 50 --nostream';

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;

        stream.on('data', (data) => {
            process.stdout.write(data.toString());
        });

        stream.on('close', () => {
            conn.end();
        });
    });

}).connect({
    host: '82.165.138.12',
    port: 22,
    username: 'root',
    password: '7GYMO97a'
});
