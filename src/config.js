require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3001,
  laravelApiUrl: process.env.LARAVEL_API_URL || 'http://localhost:8000/api',
  webhookSecret: process.env.WEBHOOK_SECRET,
  corsOrigins: process.env.CORS_ORIGINS || '*',
};
