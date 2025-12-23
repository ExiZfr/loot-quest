/**
 * Deploy Nginx config and install SSL certificate
 */

const { Client } = require('ssh2');

const conn = new Client();

console.log('═══════════════════════════════════════════════════════════');
console.log('   🔒 Configuring Nginx + SSL for loot-quest.fr');
console.log('═══════════════════════════════════════════════════════════\n');

conn.on('ready', () => {
    const commands = [
        // Update repo and get latest nginx config
        'cd /var/www/lootquest && git pull origin master',

        // Copy Nginx config
        'cp /var/www/lootquest/nginx/lootquest.conf /etc/nginx/sites-available/lootquest',
        'ln -sf /etc/nginx/sites-available/lootquest /etc/nginx/sites-enabled/',
        'rm -f /etc/nginx/sites-enabled/default',

        // Add rate limiting zone to nginx.conf if not exists
        'grep -q "limit_req_zone" /etc/nginx/nginx.conf || sed -i "/http {/a \\    limit_req_zone \\$binary_remote_addr zone=api:10m rate=10r/s;" /etc/nginx/nginx.conf',

        // Test nginx config
        'nginx -t',

        // Install certbot if not installed
        'command -v certbot || apt install -y certbot python3-certbot-nginx',

        // Get SSL certificate
        'certbot --nginx -d loot-quest.fr -d www.loot-quest.fr --non-interactive --agree-tos --email admin@loot-quest.fr --redirect',

        // Reload nginx
        'systemctl reload nginx',

        // Show status
        'echo "\\n✅ Nginx configured with SSL!"',
        'echo "🌐 https://loot-quest.fr"',
        'nginx -T | grep "server_name"'
    ];

    conn.exec(commands.join(' && '), { pty: true }, (err, stream) => {
        if (err) throw err;

        stream.on('data', (data) => {
            process.stdout.write(data.toString());
        });

        stream.on('close', (code) => {
            console.log('\n═══════════════════════════════════════════════════════════');
            if (code === 0 || code === null) {
                console.log('   ✅ SSL Configuration Complete!');
                console.log('═══════════════════════════════════════════════════════════');
                console.log('\n   🌐 https://loot-quest.fr');
                console.log('   🔒 SSL certificate installed');
                console.log('   🔄 Auto-renewal enabled');
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
