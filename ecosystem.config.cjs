module.exports = {
  apps: [
    {
      name: 'finance-management',
      cwd: './backend',
      script: 'dist/main.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 8006,
        // Qwen fetches PDFs through a short-lived signed URL. Override this
        // environment variable when the deployment moves to a domain/HTTPS.
        BANK_STATEMENT_PUBLIC_BASE_URL:
          process.env.BANK_STATEMENT_PUBLIC_BASE_URL || 'http://139.196.44.6:8006',
      },
      error_file: '../logs/pm2-error.log',
      out_file: '../logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
