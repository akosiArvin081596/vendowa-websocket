const { EventEmitter } = require('events');

const MAX_LOGS = 200;
const logs = [];
const logEvents = new EventEmitter();

function addLog(level, message, context = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };

  logs.unshift(entry);

  if (logs.length > MAX_LOGS) {
    logs.pop();
  }

  logEvents.emit('log', entry);
}

function getRecentLogs() {
  return logs.slice(0, MAX_LOGS);
}

function onLog(listener) {
  logEvents.on('log', listener);

  return () => {
    logEvents.off('log', listener);
  };
}

module.exports = {
  addLog,
  getRecentLogs,
  onLog,
};
