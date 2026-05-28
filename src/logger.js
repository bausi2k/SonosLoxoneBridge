const { insertLog } = require('./db');

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function formatArgs(args) {
  return args.map(arg => {
    if (arg instanceof Error) {
      return arg.message + (arg.stack ? '\n' + arg.stack : '');
    }
    return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
  }).join(' ');
}

/**
 * Structured log helper: INFO
 */
function info(message, category = 'SYSTEM', details = null) {
  originalLog(`[INFO] [${category}] ${message}`);
  insertLog(category, 'INFO', message, details);
}

/**
 * Structured log helper: WARN
 */
function warn(message, category = 'SYSTEM', details = null) {
  originalWarn(`[WARN] [${category}] ${message}`);
  insertLog(category, 'WARN', message, details);
}

/**
 * Structured log helper: ERROR
 */
function error(message, category = 'SYSTEM', details = null) {
  originalError(`[ERROR] [${category}] ${message}`);
  insertLog(category, 'ERROR', message, details);
}

/**
 * Intercepts default console calls to route them to SQLite/RAM logs as SYSTEM.
 */
function hookConsole() {
  console.log = function(...args) {
    originalLog.apply(console, args);
    const msg = formatArgs(args);
    // Parse category prefix if present (e.g. "[Sonos]" or "[Loxone]")
    let category = 'SYSTEM';
    let cleanMsg = msg;
    const match = msg.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      const prefix = match[1].toUpperCase();
      if (['SONOS', 'LOXONE', 'TTS', 'BRIDGE', 'SYSTEM', 'INBOUND', 'OUTBOUND'].includes(prefix)) {
        category = prefix;
        cleanMsg = match[2];
      }
    }
    insertLog(category, 'INFO', cleanMsg);
  };

  console.error = function(...args) {
    originalError.apply(console, args);
    const msg = formatArgs(args);
    let category = 'SYSTEM';
    let cleanMsg = msg;
    const match = msg.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      const prefix = match[1].toUpperCase();
      if (['SONOS', 'LOXONE', 'TTS', 'BRIDGE', 'SYSTEM', 'INBOUND', 'OUTBOUND'].includes(prefix)) {
        category = prefix;
        cleanMsg = match[2];
      }
    }
    insertLog(category, 'ERROR', cleanMsg);
  };

  console.warn = function(...args) {
    originalWarn.apply(console, args);
    const msg = formatArgs(args);
    let category = 'SYSTEM';
    let cleanMsg = msg;
    const match = msg.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      const prefix = match[1].toUpperCase();
      if (['SONOS', 'LOXONE', 'TTS', 'BRIDGE', 'SYSTEM', 'INBOUND', 'OUTBOUND'].includes(prefix)) {
        category = prefix;
        cleanMsg = match[2];
      }
    }
    insertLog(category, 'WARN', cleanMsg);
  };
}

module.exports = {
  info,
  warn,
  error,
  hookConsole
};
