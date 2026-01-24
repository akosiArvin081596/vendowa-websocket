const config = require('../config');
const logger = require('../utils/logger');

/**
 * Validate Sanctum token via Laravel API
 * @param {string} token - The Sanctum token
 * @returns {Promise<object|null>} User data or null if invalid
 */
async function validateTokenWithLaravel(token) {
  try {
    const response = await fetch(`${config.laravelApiUrl}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      logger.debug(`Laravel API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.user || data;
  } catch (err) {
    logger.error(`Error validating token with Laravel: ${err.message}`);
    return null;
  }
}

/**
 * Socket.io authentication middleware
 * Validates Sanctum token via Laravel API
 * Allows guest connections for public events (e.g., product updates)
 */
async function authenticateSocket(socket, next) {
  const token = socket.handshake.auth.token;
  const isGuest = socket.handshake.auth.guest === true;

  // Allow guest connections
  if (!token && isGuest) {
    socket.userId = `guest_${socket.id}`;
    socket.userRole = 'guest';
    socket.isGuest = true;
    logger.debug(`Guest socket connected: ${socket.id}`);
    return next();
  }

  if (!token) {
    logger.warn('Socket connection rejected: No token provided');
    return next(new Error('Authentication token required'));
  }

  try {
    const user = await validateTokenWithLaravel(token);

    if (!user) {
      logger.warn('Socket authentication failed: Invalid or expired token');
      return next(new Error('Invalid or expired token'));
    }

    // Attach user info to socket
    socket.userId = user.id;
    socket.userRole = user.role || user.user_type;
    socket.userEmail = user.email;
    socket.userName = user.name;
    socket.isGuest = false;

    logger.debug(`Socket authenticated for user ${socket.userId} (${socket.userEmail})`);
    next();
  } catch (err) {
    logger.warn(`Socket authentication failed: ${err.message}`);
    next(new Error('Invalid or expired token'));
  }
}

/**
 * Setup socket authentication and connection handling
 */
function setupSocketAuth(io) {
  // Apply authentication middleware
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    const userType = socket.isGuest ? 'GUEST' : 'USER';
    logger.info(`[${userType}] ${socket.userId} connected (socket: ${socket.id})`);

    // Join user-specific room for targeted messages
    socket.join(`user:${socket.userId}`);

    // Join broadcast room for all sync events
    socket.join('broadcast');

    // Join role-based room
    if (socket.userRole) {
      socket.join(`role:${socket.userRole}`);
    }

    // Log room membership
    const rooms = Array.from(socket.rooms);
    logger.info(`[${userType}] ${socket.userId} joined rooms: ${rooms.join(', ')}`);

    // Log current connection stats
    const allSockets = await io.fetchSockets();
    const guestCount = allSockets.filter(s => s.isGuest).length;
    const userCount = allSockets.filter(s => !s.isGuest).length;
    logger.info(`[STATS] Total connections: ${allSockets.length} (${userCount} users, ${guestCount} guests)`)

    // Handle ping for connection health check
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle disconnect
    socket.on('disconnect', async (reason) => {
      const userType = socket.isGuest ? 'GUEST' : 'USER';
      logger.info(`[${userType}] ${socket.userId} disconnected: ${reason}`);

      // Log remaining connections
      const allSockets = await io.fetchSockets();
      const guestCount = allSockets.filter(s => s.isGuest).length;
      const userCount = allSockets.filter(s => !s.isGuest).length;
      logger.info(`[STATS] Remaining connections: ${allSockets.length} (${userCount} users, ${guestCount} guests)`);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`Socket error for user ${socket.userId}:`, error);
    });
  });
}

module.exports = { setupSocketAuth, authenticateSocket };
