/**
 * Check and fix Nginx configuration file
 */

const { Client } = require('ssh2');

const conn = new Client();

console.log('Checking Nginx configuration...\n');

conn.on('ready', () => {
    const commands = [
        // Show the actual config being used
        'echo "=== Current lootquest.conf ==="',
        'cat /etc/nginx/sites-available/lootquest | head -60',

        // Check if there are multiple server blocks
        'echo ""',
        'echo "=== Server blocks defined ==="',
        'grep -n "server_name" /etc/nginx/sites-available/lootquest',

        // Test HTTPS locally
        'echo ""',
        'echo "=== Testing HTTPS locally ==="',
        'curl -k -s https://localhost | head -20',

        // Copy fresh config and reload
        'echo ""',
        'echo "=== Updating config ==="',
        'cp /var/www/lootquest/nginx/lootquest.conf /etc/nginx/sites-available/lootquest',
        'nginx -t && systemctl reload nginx',

        'echo "=== Testing again ==="',
        'curl -k -s https://localhost | head -20'
    ];

    conn.exec(commands.join(' && '), { pty: true }, (err, stream) => {
        if (err) throw err;

        stream.on('data', (data) => {
            process.stdout.write(data.toString());
        });

        stream.on('close', () => {
            console.log('\n✅ Check complete. Try refreshing https://loot-quest.fr (Ctrl+F5)');
            conn.end();
        });
    });

}).connect({
    host: '82.165.138.12',
    port: 22,
    username: 'root',
    password: '7GYMO97a'
});
