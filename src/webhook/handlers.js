const { broadcastEvent, SYNC_EVENTS } = require('../socket/handlers');
const logger = require('../utils/logger');

/**
 * Build a human-readable log message for known event types.
 * Returns null for unknown events (falls back to generic log).
 */
function formatEventLog(event, data) {
  const u = (val) => val || 'unknown';

  switch (event) {
    case SYNC_EVENTS.USER_LOGIN:
      return {
        tag: 'LOGIN',
        message: `User "${u(data.name)}" (${u(data.email)}) logged in [${u(data.user_type)}]`,
        context: { userId: data.user_id, email: data.email, name: data.name, role: data.user_type },
      };
    case SYNC_EVENTS.USER_LOGOUT:
      return {
        tag: 'LOGOUT',
        message: `User "${u(data.name)}" (${u(data.email)}) logged out`,
        context: { userId: data.user_id, email: data.email, name: data.name },
      };
    case SYNC_EVENTS.PRODUCT_CREATED:
      return {
        tag: 'PRODUCT',
        message: `Product created: "${u(data.name)}" (ID: ${u(data.id)})`,
        context: { productId: data.id, userId: data.user_id },
      };
    case SYNC_EVENTS.PRODUCT_UPDATED:
      return {
        tag: 'PRODUCT',
        message: `Product updated: "${u(data.name)}" (ID: ${u(data.id)})`,
        context: { productId: data.id, userId: data.user_id },
      };
    case SYNC_EVENTS.PRODUCT_DELETED:
      return {
        tag: 'PRODUCT',
        message: `Product deleted: ID ${u(data.id)}`,
        context: { productId: data.id, userId: data.user_id },
      };
    case SYNC_EVENTS.STOCK_UPDATED:
      return {
        tag: 'STOCK',
        message: `Stock updated for product ID ${u(data.product_id)}: ${data.old_quantity ?? '?'} -> ${data.new_quantity ?? data.quantity ?? '?'}`,
        context: { productId: data.product_id, userId: data.user_id },
      };
    case SYNC_EVENTS.ORDER_CREATED:
      return {
        tag: 'ORDER',
        message: `Order created: #${u(data.order_number || data.id)}`,
        context: { orderId: data.id, userId: data.user_id },
      };
    case SYNC_EVENTS.ORDER_UPDATED:
      return {
        tag: 'ORDER',
        message: `Order updated: #${u(data.order_number || data.id)} -> ${u(data.status)}`,
        context: { orderId: data.id, userId: data.user_id },
      };
    case SYNC_EVENTS.CATEGORY_CREATED:
      return {
        tag: 'CATEGORY',
        message: `Category created: "${u(data.name)}" (ID: ${u(data.id)})`,
        context: { categoryId: data.id, userId: data.user_id },
      };
    case SYNC_EVENTS.CATEGORY_UPDATED:
      return {
        tag: 'CATEGORY',
        message: `Category updated: "${u(data.name)}" (ID: ${u(data.id)})`,
        context: { categoryId: data.id, userId: data.user_id },
      };
    case SYNC_EVENTS.CATEGORY_DELETED:
      return {
        tag: 'CATEGORY',
        message: `Category deleted: ID ${u(data.id)}`,
        context: { categoryId: data.id, userId: data.user_id },
      };
    default:
      return null;
  }
}

/**
 * Handle incoming webhook event and broadcast to connected clients
 */
function handleWebhookEvent(io, event, data) {
  // Validate event type
  const validEvents = Object.values(SYNC_EVENTS);

  if (!validEvents.includes(event)) {
    logger.warn(`Unknown event type received: ${event}`);
  }

  // Log a descriptive message for the event
  const formatted = formatEventLog(event, data);
  if (formatted) {
    logger.logWithContext('INFO', `[${formatted.tag}] ${formatted.message}`, formatted.context);
  } else {
    logger.info(`[WEBHOOK] Event: ${event}`, JSON.stringify(data).substring(0, 300));
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
