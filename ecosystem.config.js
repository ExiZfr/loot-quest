module.exports = {
    apps: [
        {
            name: 'lootquest',
            script: 'server.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
                PORT: 3000
            }
        },
        {
            name: 'auto-blog-generator',
            script: 'auto-blog-generator.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            cron_restart: '0 0 * * *', // Restart daily at midnight to prevent memory leaks
            env: {
                NODE_ENV: 'production'
            },
            error_file: 'logs/auto-blog-err.log',
            out_file: 'logs/auto-blog-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss'
        }
    ]
};
