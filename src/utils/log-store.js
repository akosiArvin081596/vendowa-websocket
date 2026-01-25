const MAX_LOGS = 200;
const logs = [];

function addLog(level, message, context = null) {
  logs.unshift({
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  });

  if (logs.length > MAX_LOGS) {
    logs.pop();
  }
}

function getRecentLogs() {
  return logs.slice(0, MAX_LOGS);
}

module.exports = {
  addLog,
  getRecentLogs,
};
