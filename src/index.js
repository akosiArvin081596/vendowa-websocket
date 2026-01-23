require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const config = require('./config');
const { initializeSocketServer } = require('./socket');
const createWebhookRoutes = require('./webhook/routes');
const logger = require('./utils/logger');

// Validate required config
if (!config.webhookSecret) {
  logger.error('WEBHOOK_SECRET is required. Check your .env file.');
  process.exit(1);
}

logger.info(`Laravel API URL: ${config.laravelApiUrl}`);

// Create Express app and HTTP server
const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
const io = initializeSocketServer(httpServer);

// Basic middleware - capture raw body for webhook signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// CORS for REST endpoints
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Signature');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Vendora WebSocket Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      websocket: `ws://localhost:${config.port}`,
      health: '/webhook/health',
      events: '/webhook/events (POST)',
    },
  });
});

// Webhook routes
app.use('/webhook', createWebhookRoutes(io));

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
httpServer.listen(config.port, () => {
  logger.info(`Vendora WebSocket Server running on port ${config.port}`);
  logger.info(`WebSocket endpoint: ws://localhost:${config.port}`);
  logger.info(`Webhook endpoint: http://localhost:${config.port}/webhook/events`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down...');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down...');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
