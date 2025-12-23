/**
 * Check VPS directory structure
 */

const { Client } = require('ssh2');

const conn = new Client();

console.log('Checking VPS directory...\n');

conn.on('ready', () => {
    conn.exec('ls -la /var/www/lootquest/', (err, stream) => {
        if (err) throw err;

        stream.on('data', (data) => {
            console.log(data.toString());
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
