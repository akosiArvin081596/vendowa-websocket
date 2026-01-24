const logger = require('../utils/logger');

/**
 * Event types that can be broadcast
 */
const SYNC_EVENTS = {
  // Product events
  PRODUCT_CREATED: 'product:created',
  PRODUCT_UPDATED: 'product:updated',
  PRODUCT_DELETED: 'product:deleted',
  STOCK_UPDATED: 'stock:updated',

  // Order events
  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',

  // Category events
  CATEGORY_CREATED: 'category:created',
  CATEGORY_UPDATED: 'category:updated',
  CATEGORY_DELETED: 'category:deleted',
};

/**
 * Broadcast an event to all connected clients
 */
async function broadcastEvent(io, event, data) {
  // Get clients in broadcast room
  const broadcastRoom = io.sockets.adapter.rooms.get('broadcast');
  const clientCount = broadcastRoom ? broadcastRoom.size : 0;

  logger.info(`[BROADCAST] Event: ${event} -> ${clientCount} clients in 'broadcast' room`);
  logger.debug('Event data:', JSON.stringify(data).substring(0, 200));

  // Log individual socket IDs in broadcast room (for debugging)
  if (broadcastRoom && broadcastRoom.size > 0) {
    const socketIds = Array.from(broadcastRoom);
    logger.debug(`[BROADCAST] Socket IDs: ${socketIds.join(', ')}`);
  } else {
    logger.warn(`[BROADCAST] No clients in 'broadcast' room!`);
  }

  io.to('broadcast').emit(event, data);
}

/**
 * Send event to specific user
 */
function sendToUser(io, userId, event, data) {
  logger.debug(`Sending ${event} to user ${userId}`);
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Send event to users with specific role
 */
function sendToRole(io, role, event, data) {
  logger.debug(`Sending ${event} to role ${role}`);
  io.to(`role:${role}`).emit(event, data);
}

/**
 * Get connected clients count
 */
async function getConnectedClients(io) {
  const sockets = await io.fetchSockets();
  return {
    total: sockets.length,
    users: [...new Set(sockets.map(s => s.userId))],
  };
}

module.exports = {
  SYNC_EVENTS,
  broadcastEvent,
  sendToUser,
  sendToRole,
  getConnectedClients,
};
