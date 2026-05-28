const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const { getSettings } = require('./settings');

let db = null;
let dbPath = null;
const MEMORY_DB_LIMIT = 1000;
const PHYSICAL_DB_LIMIT = 20000;

/**
 * Initializes the SQLite database.
 * Dynamic path: file-based if enableDatabaseLogs is true, otherwise in-memory.
 */
function initDb() {
  const settings = getSettings();
  const enableDb = settings.enableDatabaseLogs === true;
  const configDir = path.join(__dirname, '../config');
  const targetPath = enableDb ? path.join(configDir, 'statistics.db') : ':memory:';

  // If database target has changed, close the old one
  if (db && dbPath !== targetPath) {
    try {
      db.close();
    } catch (e) {
      // Ignore
    }
    db = null;
  }

  if (!db) {
    dbPath = targetPath;
    if (enableDb && !fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    db = new DatabaseSync(dbPath);
    
    // Create logs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER,
        category TEXT,
        level TEXT,
        message TEXT,
        details TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category);
    `);
  }
}

/**
 * Inserts a log entry into the database.
 * @param {string} category - INBOUND, OUTBOUND, SYSTEM
 * @param {string} level - INFO, WARN, ERROR
 * @param {string} message - Log message
 * @param {object|string|null} details - Additional debug info
 */
function insertLog(category, level, message, details = null) {
  try {
    if (!db) initDb();

    const timestamp = Date.now();
    const detailsStr = details 
      ? (typeof details === 'object' ? JSON.stringify(details) : String(details))
      : null;

    const insertStmt = db.prepare(`
      INSERT INTO logs (timestamp, category, level, message, details)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertStmt.run(timestamp, category, level, message, detailsStr);

    // Prune logs asynchronously/periodically to limit size
    pruneLogs();
  } catch (err) {
    console.error('[Database Log Error] Failed to insert log:', err.message);
  }
}

/**
 * Prunes the log database to prevent unbounded growth.
 */
function pruneLogs() {
  try {
    const settings = getSettings();
    const enableDb = settings.enableDatabaseLogs === true;
    const limit = enableDb ? PHYSICAL_DB_LIMIT : MEMORY_DB_LIMIT;

    // Delete older entries if count exceeds limit
    db.exec(`
      DELETE FROM logs WHERE id IN (
        SELECT id FROM logs ORDER BY timestamp DESC LIMIT -1 OFFSET ${limit}
      )
    `);
  } catch (err) {
    // Ignore pruning errors to prevent crash
  }
}

/**
 * Queries log entries with filters.
 * @param {object} filters - { category, days, level }
 * @returns {Array} List of matched log entries
 */
function getLogs(filters = {}) {
  try {
    if (!db) initDb();

    let query = 'SELECT * FROM logs WHERE 1=1';
    const params = [];

    if (filters.category && filters.category !== 'all') {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters.level && filters.level !== 'all') {
      query += ' AND level = ?';
      params.push(filters.level);
    }

    if (filters.days && !isNaN(parseInt(filters.days, 10))) {
      const msAgo = parseInt(filters.days, 10) * 24 * 60 * 60 * 1000;
      const minTimestamp = Date.now() - msAgo;
      query += ' AND timestamp >= ?';
      params.push(minTimestamp);
    }

    query += ' ORDER BY timestamp ASC';

    const selectStmt = db.prepare(query);
    const rows = selectStmt.all(...params);

    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      category: r.category,
      level: r.level,
      message: r.message,
      details: r.details ? JSON.parse(r.details) : null
    }));
  } catch (err) {
    console.error('[Database Log Error] Failed to query logs:', err.message);
    return [];
  }
}

/**
 * Deletes all logs.
 */
function clearLogs() {
  try {
    if (!db) initDb();
    db.exec('DELETE FROM logs');
    return true;
  } catch (err) {
    console.error('[Database Log Error] Failed to clear logs:', err.message);
    return false;
  }
}

module.exports = {
  initDb,
  insertLog,
  getLogs,
  clearLogs
};
