const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const currentLevel = process.env.LOG_LEVEL
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
  : LOG_LEVELS.INFO;

const timestamp = () => new Date().toISOString();

const logger = {
  error: (...args) => {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      console.error(`[${timestamp()}] ERROR:`, ...args);
    }
  },
  warn: (...args) => {
    if (currentLevel >= LOG_LEVELS.WARN) {
      console.warn(`[${timestamp()}] WARN:`, ...args);
    }
  },
  info: (...args) => {
    if (currentLevel >= LOG_LEVELS.INFO) {
      console.log(`[${timestamp()}] INFO:`, ...args);
    }
  },
  debug: (...args) => {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      console.log(`[${timestamp()}] DEBUG:`, ...args);
    }
  },
};

module.exports = logger;
