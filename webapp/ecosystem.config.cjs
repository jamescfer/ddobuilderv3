// PM2 process config
// https://pm2.keymetrics.io/docs/usage/application-declaration/
require('dotenv').config()

module.exports = {
  apps: [
    {
      name: 'ddo-builder',
      script: './dist-server/server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 8756,
        DATA_FILES_PATH: process.env.DATA_FILES_PATH || '../Output/DataFiles',
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
