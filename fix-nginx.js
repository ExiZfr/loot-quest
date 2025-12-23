/**
 * Fix Nginx Configuration to proxy to Node.js app
 */

const { Client } = require('ssh2');

const conn = new Client();

console.log('═══════════════════════════════════════════════════════════');
console.log('   🔧 Fixing Nginx Configuration');
console.log('═══════════════════════════════════════════════════════════\n');

conn.on('ready', () => {
    const commands = [
        // Check current config
        'echo "=== Current sites-enabled ==="',
        'ls -la /etc/nginx/sites-enabled/',

        // Backup and remove default
        'rm -f /etc/nginx/sites-enabled/default',

        // Copy our config and create symlink
        'cp /var/www/lootquest/nginx/lootquest.conf /etc/nginx/sites-available/lootquest',
        'ln -sf /etc/nginx/sites-available/lootquest /etc/nginx/sites-enabled/lootquest',

        // Add rate limiting to nginx.conf if not exists
        'grep -q "limit_req_zone" /etc/nginx/nginx.conf || sed -i "/http {/a \\    limit_req_zone \\$binary_remote_addr zone=api:10m rate=10r/s;" /etc/nginx/nginx.conf',

        // Test config
        'echo "=== Testing Nginx config ==="',
        'nginx -t',

        // Reload nginx
        'echo "=== Reloading Nginx ==="',
        'systemctl reload nginx',

        // Show status
        'echo "=== Nginx status ==="',
        'systemctl status nginx --no-pager -l',

        // Show what's listening on port 80/443
        'echo "=== Ports ==="',
        'ss -tlnp | grep nginx'
    ];

    conn.exec(commands.join(' && '), { pty: true }, (err, stream) => {
        if (err) throw err;

        stream.on('data', (data) => {
            process.stdout.write(data.toString());
        });

        stream.on('close', (code) => {
            console.log('\n═══════════════════════════════════════════════════════════');
            if (code === 0 || code === null) {
                console.log('   ✅ Nginx Fixed!');
                console.log('   🌐 Try: https://loot-quest.fr');
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
