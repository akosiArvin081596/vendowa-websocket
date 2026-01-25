const express = require('express');
const { verifySignature } = require('./verify');
const { handleWebhookEvent } = require('./handlers');
const { getConnectedClients } = require('../socket/handlers');
const { getRecentLogs } = require('../utils/log-store');
const logger = require('../utils/logger');

const renderLogsUi = () => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vendora WebSocket Logs</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      background: #0b0f14;
      color: #e6edf3;
    }
    .wrap {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }
    .title {
      font-size: 20px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    select, input, button {
      background: #111826;
      border: 1px solid #1f2a37;
      color: inherit;
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 14px;
    }
    button {
      cursor: pointer;
    }
    button[data-active="true"] {
      border-color: #22c55e;
      color: #22c55e;
    }
    .status {
      font-size: 13px;
      color: #94a3b8;
    }
    .log-list {
      background: #0f172a;
      border: 1px solid #1f2a37;
      border-radius: 12px;
      overflow: hidden;
    }
    .log-row {
      display: grid;
      grid-template-columns: 180px 80px 220px 1fr;
      gap: 12px;
      padding: 10px 16px;
      border-bottom: 1px solid #1f2a37;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 13px;
      line-height: 1.4;
    }
    .log-header {
      font-weight: 600;
      letter-spacing: 0.2px;
      text-transform: uppercase;
      font-size: 11px;
      background: #0b1220;
    }
    .log-row:last-child {
      border-bottom: none;
    }
    .log-row[data-level="ERROR"] { background: rgba(239, 68, 68, 0.08); }
    .log-row[data-level="WARN"] { background: rgba(245, 158, 11, 0.08); }
    .log-row[data-level="INFO"] { background: rgba(59, 130, 246, 0.08); }
    .log-row[data-level="DEBUG"] { background: rgba(148, 163, 184, 0.06); }
    .empty {
      padding: 24px;
      text-align: center;
      color: #94a3b8;
    }
    @media (max-width: 820px) {
      .log-row {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="title">Vendora WebSocket Logs</div>
      <div class="controls">
        <select id="levelFilter">
          <option value="">All Levels</option>
          <option value="ERROR">Error</option>
          <option value="WARN">Warn</option>
          <option value="INFO">Info</option>
          <option value="DEBUG">Debug</option>
        </select>
        <input id="searchInput" type="search" placeholder="Search logs">
        <select id="refreshInterval">
          <option value="1000">Refresh 1s</option>
          <option value="2000" selected>Refresh 2s</option>
          <option value="5000">Refresh 5s</option>
          <option value="10000">Refresh 10s</option>
        </select>
        <button id="pauseBtn" type="button" data-active="false">Pause</button>
        <button id="refreshBtn" type="button">Refresh</button>
      </div>
    </header>
    <div class="status" id="statusText">Connecting…</div>
    <div class="log-list" id="logList">
      <div class="empty">Waiting for logs…</div>
    </div>
  </div>
  <script>
    const logList = document.getElementById('logList');
    const statusText = document.getElementById('statusText');
    const levelFilter = document.getElementById('levelFilter');
    const searchInput = document.getElementById('searchInput');
    const refreshInterval = document.getElementById('refreshInterval');
    const pauseBtn = document.getElementById('pauseBtn');
    const refreshBtn = document.getElementById('refreshBtn');

    let isPaused = false;
    let intervalId = null;

    const escapeHtml = (value) => value.replace(/[&<>"']/g, (match) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[match]));

    const applyFilters = (logs) => {
      const level = levelFilter.value;
      const term = searchInput.value.trim().toLowerCase();
      return logs.filter((log) => {
        if (level && log.level !== level) {
          return false;
        }
        if (term) {
          const context = log.context || {};
          const haystack = [
            log.timestamp,
            log.level,
            log.message,
            context.userName,
            context.userEmail,
            context.userId,
          ].join(' ').toLowerCase();
          return haystack.includes(term);
        }
        return true;
      });
    };

    const formatUser = (context = {}) => {
      if (context.userName && context.userEmail) {
        return context.userName + ' <' + context.userEmail + '>';
      }
      if (context.userName) {
        return context.userName;
      }
      if (context.userEmail) {
        return context.userEmail;
      }
      if (context.userId) {
        return String(context.userId);
      }
      return '—';
    };

    const renderLogs = (logs) => {
      if (!logs.length) {
        logList.innerHTML = '<div class="empty">No logs match your filters.</div>';
        return;
      }
      const rows = logs.map((log) => {
        return '<div class="log-row" data-level="' + escapeHtml(log.level) + '">' +
          '<div>' + escapeHtml(log.timestamp) + '</div>' +
          '<div>' + escapeHtml(log.level) + '</div>' +
          '<div>' + escapeHtml(formatUser(log.context)) + '</div>' +
          '<div>' + escapeHtml(log.message) + '</div>' +
        '</div>';
      }).join('');

      logList.innerHTML =
        '<div class="log-row log-header">' +
          '<div>Timestamp</div>' +
          '<div>Level</div>' +
          '<div>User</div>' +
          '<div>Message</div>' +
        '</div>' +
        rows;
    };

    const fetchLogs = async () => {
      if (isPaused) {
        return;
      }
      try {
        const response = await fetch('/webhook/logs');
        if (!response.ok) {
          throw new Error('Failed to load logs');
        }
        const data = await response.json();
        const filtered = applyFilters(data.logs || []);
        statusText.textContent = 'Showing ' + filtered.length + ' of ' + (data.logs || []).length + ' logs';
        renderLogs(filtered);
      } catch (error) {
        statusText.textContent = 'Unable to load logs. Retrying…';
      }
    };

    const restartPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      intervalId = setInterval(fetchLogs, Number(refreshInterval.value));
    };

    pauseBtn.addEventListener('click', () => {
      isPaused = !isPaused;
      pauseBtn.dataset.active = String(isPaused);
      pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
      statusText.textContent = isPaused ? 'Paused' : 'Resumed';
      if (!isPaused) {
        fetchLogs();
      }
    });

    refreshBtn.addEventListener('click', fetchLogs);
    refreshInterval.addEventListener('change', restartPolling);
    levelFilter.addEventListener('change', fetchLogs);
    searchInput.addEventListener('input', fetchLogs);

    restartPolling();
    fetchLogs();
  </script>
</body>
</html>`;

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
   * Debug endpoint - shows detailed connection info
   * GET /webhook/debug
   */
  router.get('/debug', async (req, res) => {
    try {
      const allSockets = await io.fetchSockets();
      const broadcastRoom = io.sockets.adapter.rooms.get('broadcast');

      const connections = allSockets.map(s => ({
        id: s.id,
        userId: s.userId,
        role: s.userRole,
        isGuest: s.isGuest,
        rooms: Array.from(s.rooms),
      }));

      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        stats: {
          total: allSockets.length,
          guests: allSockets.filter(s => s.isGuest).length,
          authenticated: allSockets.filter(s => !s.isGuest).length,
          inBroadcastRoom: broadcastRoom ? broadcastRoom.size : 0,
        },
        connections,
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

  /**
   * Logs endpoint for the UI
   * GET /webhook/logs
   */
  router.get('/logs', (req, res) => {
    const logs = getRecentLogs();
    res.json({
      status: 'ok',
      count: logs.length,
      logs,
    });
  });

  /**
   * Simple UI for viewing logs
   * GET /webhook/logs/ui
   */
  router.get('/logs/ui', (req, res) => {
    res.type('html').send(renderLogsUi());
  });

  return router;
}

module.exports = createWebhookRoutes;
