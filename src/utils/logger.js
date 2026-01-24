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
const { addLog } = require('./log-store');

const safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return '[Unserializable]';
  }
};

const formatLogArgs = (args) => args.map((arg) => {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }
  if (typeof arg === 'object' && arg !== null) {
    return safeStringify(arg);
  }
  return String(arg);
}).join(' ');

const logger = {
  error: (...args) => {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      console.error(`[${timestamp()}] ERROR:`, ...args);
      addLog('ERROR', formatLogArgs(args));
    }
  },
  warn: (...args) => {
    if (currentLevel >= LOG_LEVELS.WARN) {
      console.warn(`[${timestamp()}] WARN:`, ...args);
      addLog('WARN', formatLogArgs(args));
    }
  },
  info: (...args) => {
    if (currentLevel >= LOG_LEVELS.INFO) {
      console.log(`[${timestamp()}] INFO:`, ...args);
      addLog('INFO', formatLogArgs(args));
    }
  },
  debug: (...args) => {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      console.log(`[${timestamp()}] DEBUG:`, ...args);
      addLog('DEBUG', formatLogArgs(args));
    }
  },
};

module.exports = logger;
