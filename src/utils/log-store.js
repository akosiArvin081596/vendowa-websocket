const MAX_LOGS = 200;
const logs = [];

function addLog(level, message) {
  logs.unshift({
    timestamp: new Date().toISOString(),
    level,
    message,
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
