const express = require('express');
const { verifySignature } = require('./verify');
const { handleWebhookEvent } = require('./handlers');
const { getConnectedClients } = require('../socket/handlers');
const logger = require('../utils/logger');

/**
 * Create webhook routes
 */
function createWebhookRoutes(io) {
  const router = express.Router();

  /**
   * Main webhook endpoint for Laravel events
   * POST /webhook/events
   */
  router.post('/events', verifySignature, (req, res) => {
    const { event, data } = req.body;

    if (!event) {
      return res.status(400).json({
        success: false,
        error: 'Event type is required'
      });
    }

    try {
      const result = handleWebhookEvent(io, event, data || {});

      logger.info(`Webhook processed: ${event}`);

      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      logger.error(`Error processing webhook: ${err.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to process webhook'
      });
    }
  });

  /**
   * Health check endpoint (no auth required)
   * GET /webhook/health
   */
  router.get('/health', async (req, res) => {
    try {
      const clients = await getConnectedClients(io);
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        connections: clients.total,
        uniqueUsers: clients.users.length,
      });
    } catch (err) {
      res.status(500).json({
        status: 'error',
        error: err.message
      });
    }
  });

  /**
   * Batch events endpoint for multiple events
   * POST /webhook/batch
   */
  router.post('/batch', verifySignature, (req, res) => {
    const { events } = req.body;

    if (!Array.isArray(events)) {
      return res.status(400).json({
        success: false,
        error: 'Events array is required'
      });
    }

    const results = events.map(({ event, data }) => {
      try {
        return handleWebhookEvent(io, event, data || {});
      } catch (err) {
        return { error: err.message, event };
      }
    });

    logger.info(`Batch webhook processed: ${events.length} events`);

    res.json({
      success: true,
      processed: results.length,
      results
    });
  });

  return router;
}

module.exports = createWebhookRoutes;
