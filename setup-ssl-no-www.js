/**
 * Install SSL for loot-quest.fr only (no www)
 */

const { Client } = require('ssh2');

const conn = new Client();

console.log('═══════════════════════════════════════════════════════════');
console.log('   🔒 Installing SSL for loot-quest.fr');
console.log('═══════════════════════════════════════════════════════════\n');

conn.on('ready', () => {
    const commands = [
        // Update Nginx config to remove www
        'cd /var/www/lootquest && git pull origin master',
        'sed -i "s/loot-quest.fr www.loot-quest.fr/loot-quest.fr/g" /var/www/lootquest/nginx/lootquest.conf',
        'sed -i "s/www.loot-quest.fr//g" /var/www/lootquest/nginx/lootquest.conf',
        'cp /var/www/lootquest/nginx/lootquest.conf /etc/nginx/sites-available/lootquest',

        // Get SSL for loot-quest.fr only
        'certbot --nginx -d loot-quest.fr --non-interactive --agree-tos --email admin@loot-quest.fr --redirect',

        // Reload nginx
        'systemctl reload nginx',

        // Show status
        'echo "\\n✅ SSL installed for https://loot-quest.fr"',
        'certbot certificates'
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
                console.log('   🔒 SSL certificate active');
                console.log('   🔄 Auto-renewal: certbot renew');
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
