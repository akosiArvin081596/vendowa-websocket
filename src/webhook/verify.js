const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * HMAC signature verification middleware
 * Verifies that webhook requests come from authorized source (Laravel)
 */
function verifySignature(req, res, next) {
  const signature = req.headers['x-webhook-signature'];

  if (!signature) {
    logger.warn('Webhook rejected: Missing signature header');
    return res.status(401).json({
      success: false,
      error: 'Missing webhook signature'
    });
  }

  if (!config.webhookSecret) {
    logger.error('Webhook secret not configured');
    return res.status(500).json({
      success: false,
      error: 'Server configuration error'
    });
  }

  // Calculate expected signature using raw body (preserves exact JSON from Laravel)
  const payload = req.rawBody || JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', config.webhookSecret)
    .update(payload)
    .digest('hex');

  // Debug logging
  logger.debug('Webhook signature debug:', {
    receivedSignature: signature,
    expectedSignature: expectedSignature,
    payloadLength: payload.length,
    hasRawBody: !!req.rawBody,
    secret: config.webhookSecret ? config.webhookSecret.substring(0, 3) + '...' : 'NOT SET'
  });

  // Compare signatures (timing-safe)
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    logger.warn('Webhook rejected: Invalid signature', {
      received: signature.substring(0, 16) + '...',
      expected: expectedSignature.substring(0, 16) + '...'
    });
    return res.status(401).json({
      success: false,
      error: 'Invalid webhook signature'
    });
  }

  logger.debug('Webhook signature verified');
  next();
}

/**
 * Generate signature for testing
 */
function generateSignature(payload) {
  const payloadString = typeof payload === 'string'
    ? payload
    : JSON.stringify(payload);

  return crypto
    .createHmac('sha256', config.webhookSecret)
    .update(payloadString)
    .digest('hex');
}

module.exports = { verifySignature, generateSignature };
