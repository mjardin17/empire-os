/**
 * PM2 process config for Empire OS server.
 * Run with: npx pm2 start pm2.config.cjs
 * Monitor with: npx pm2 monit
 * Stop with: npx pm2 stop empire-os
 * Logs: npx pm2 logs empire-os
 */
module.exports = {
  apps: [
    {
      name: 'empire-os',
      script: 'server.ts',
      interpreter: 'tsx',
      cwd: __dirname,

      // Auto-restart on crash
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,  // 3s between restart attempts

      // Restart if memory exceeds 512MB (memory leak guard)
      max_memory_restart: '512M',

      // Watch .env changes and restart
      watch: false,          // set to true if you want hot reload on file changes
      ignore_watch: ['node_modules', '.empire-data', '*.log'],

      // Logging
      out_file: '../../logs/empire-os.out.log',
      error_file: '../../logs/empire-os.err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Env — loaded from .env by dotenv/config inside server.ts
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
