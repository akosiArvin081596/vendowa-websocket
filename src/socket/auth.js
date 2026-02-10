const config = require('../config');
const logger = require('../utils/logger');
const { getRecentLogs } = require('../utils/log-store');

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
    // Silent guest connection — no log entry
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

    // Auth success — connection log handled in setupSocketAuth
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
    const userContext = {
      userId: socket.userId,
      userName: socket.userName,
      userEmail: socket.userEmail,
      userRole: socket.userRole,
      isGuest: socket.isGuest,
    };

    // Join rooms
    socket.join(`user:${socket.userId}`);
    socket.join('broadcast');
    if (socket.userRole) {
      socket.join(`role:${socket.userRole}`);
    }

    // Simple connection log for authenticated users only
    if (!socket.isGuest) {
      logger.logWithContext(
        'INFO',
        `[CONNECTED] ${socket.userName} (${socket.userEmail}) connected`,
        userContext,
      );
    }

    // Handle ping for connection health check
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle disconnect
    socket.on('disconnect', async (reason) => {
      if (!socket.isGuest) {
        logger.logWithContext(
          'INFO',
          `[DISCONNECTED] ${socket.userName} (${socket.userEmail}) disconnected`,
          userContext,
        );
      }
    });

    const sendLogsSnapshot = () => {
      const logs = getRecentLogs();
      socket.emit('logs:initial', {
        status: 'ok',
        count: logs.length,
        logs,
      });
    };

    socket.on('logs:subscribe', () => {
      socket.join('logs-ui');
      sendLogsSnapshot();
    });

    socket.on('logs:request', sendLogsSnapshot);

    socket.on('logs:unsubscribe', () => {
      socket.leave('logs-ui');
    });

    // Handle errors
    socket.on('error', (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.logWithContext(
        'ERROR',
        `Socket error for user ${socket.userId}: ${errorMessage || 'Unknown error'}`,
        {
          ...userContext,
          error: error instanceof Error ? error.stack || error.message : errorMessage,
        },
      );
    });
  });
}

module.exports = { setupSocketAuth, authenticateSocket };
