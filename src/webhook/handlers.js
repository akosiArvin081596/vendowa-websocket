const { broadcastEvent, SYNC_EVENTS } = require('../socket/handlers');
const logger = require('../utils/logger');

/**
 * Handle incoming webhook event and broadcast to connected clients
 */
function handleWebhookEvent(io, event, data) {
  // Validate event type
  const validEvents = Object.values(SYNC_EVENTS);

  if (!validEvents.includes(event)) {
    logger.warn(`Unknown event type received: ${event}`);
    // Still broadcast unknown events in case of custom events
  }

  // Add server timestamp to event data
  const enrichedData = {
    ...data,
    _serverTimestamp: Date.now(),
  };

  // Broadcast to all connected clients
  broadcastEvent(io, event, enrichedData);

  return {
    broadcasted: true,
    event,
    timestamp: enrichedData._serverTimestamp
  };
}

module.exports = { handleWebhookEvent };
