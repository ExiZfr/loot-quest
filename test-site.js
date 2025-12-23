/**
 * Test site accessibility
 */

const { Client } = require('ssh2');

const conn = new Client();

console.log('Testing site accessibility...\n');

conn.on('ready', () => {
    const commands = [
        // Test local connection to Node.js
        'echo "=== Testing Node.js app (localhost:3000) ==="',
        'curl -s http://localhost:3000 | head -20',

        // Test Nginx proxy
        'echo ""',
        'echo "=== Testing Nginx proxy (localhost:80) ==="',
        'curl -s http://localhost | head -20',

        // Check nginx config files
        'echo ""',
        'echo "=== Active Nginx configs ==="',
        'ls -la /etc/nginx/sites-enabled/',

        // Show nginx error log if any
        'echo ""',
        'echo "=== Recent Nginx errors (if any) ==="',
        'tail -20 /var/log/nginx/error.log || echo "No errors"'
    ];

    conn.exec(commands.join(' && '), { pty: true }, (err, stream) => {
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
