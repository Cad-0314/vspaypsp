module.exports = {
    apps: [{
        name: 'payable-api',
        script: 'server.js',
        instances: 'max', // Uses all CPU cores
        exec_mode: 'cluster',
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'production'
        },
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_file: './logs/pm2-combined.log',
        time: true,

        // Performance optimizations
        node_args: '--max-old-space-size=2048',

        // Graceful shutdown
        kill_timeout: 5000,
        wait_ready: true,
        listen_timeout: 10000,

        // Crash recovery
        min_uptime: '5s',
        max_restarts: 10,
        restart_delay: 1000
    }]
};
