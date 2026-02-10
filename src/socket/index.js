const { Server } = require('socket.io');
const config = require('../config');
const { setupSocketAuth } = require('./auth');
const logger = require('../utils/logger');
const { onLog } = require('../utils/log-store');

/**
 * Initialize Socket.io server
 */
function initializeSocketServer(httpServer) {
  const corsOrigins = config.corsOrigins === '*'
    ? '*'
    : config.corsOrigins.split(',').map(o => o.trim());

  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // Setup authentication and handlers
  setupSocketAuth(io);

  onLog((entry) => {
    io.to('logs-ui').emit('logs:new', entry);
  });

  console.log('[INFO] Socket.io server initialized');

  return io;
}

module.exports = { initializeSocketServer };
