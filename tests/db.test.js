const { initDb, insertLog, getLogs, clearLogs } = require('../src/db');
const { getSettings, saveSettings } = require('../src/settings');
const fs = require('fs');
const path = require('path');

describe('SQLite Database Logging Manager', () => {
  beforeEach(() => {
    // Force in-memory settings for testing database
    saveSettings({
      enableDatabaseLogs: false
    });
    // Initialize/reset memory db
    initDb();
    clearLogs();
  });

  test('should insert and fetch logs', () => {
    insertLog('SYSTEM', 'INFO', 'Test system log message');
    const logs = getLogs();
    
    expect(logs.length).toBe(1);
    expect(logs[0].category).toBe('SYSTEM');
    expect(logs[0].level).toBe('INFO');
    expect(logs[0].message).toBe('Test system log message');
    expect(logs[0].timestamp).toBeGreaterThan(0);
  });

  test('should filter logs by category', () => {
    insertLog('INBOUND', 'INFO', 'Loxone requested play');
    insertLog('OUTBOUND', 'INFO', 'UDP status sent');
    insertLog('SYSTEM', 'INFO', 'Bridge started');

    const inboundLogs = getLogs({ category: 'INBOUND' });
    expect(inboundLogs.length).toBe(1);
    expect(inboundLogs[0].category).toBe('INBOUND');

    const outboundLogs = getLogs({ category: 'OUTBOUND' });
    expect(outboundLogs.length).toBe(1);
    expect(outboundLogs[0].category).toBe('OUTBOUND');
  });

  test('should filter logs by level', () => {
    insertLog('SYSTEM', 'INFO', 'Info message');
    insertLog('SYSTEM', 'WARN', 'Warn message');
    insertLog('SYSTEM', 'ERROR', 'Error message');

    const errorLogs = getLogs({ level: 'ERROR' });
    expect(errorLogs.length).toBe(1);
    expect(errorLogs[0].level).toBe('ERROR');

    const warnLogs = getLogs({ level: 'WARN' });
    expect(warnLogs.length).toBe(1);
    expect(warnLogs[0].level).toBe('WARN');
  });

  test('should clear all logs', () => {
    insertLog('SYSTEM', 'INFO', 'Temporary message');
    expect(getLogs().length).toBe(1);

    clearLogs();
    expect(getLogs().length).toBe(0);
  });

  test('should respect memory logs limit by pruning', () => {
    // Insert 1005 logs in-memory
    for (let i = 0; i < 1005; i++) {
      insertLog('SYSTEM', 'INFO', `Message ${i}`);
    }

    // Default memory limit is 1000
    const logs = getLogs();
    expect(logs.length).toBeLessThanOrEqual(1000);
  });

  test('should support file-based persistence when enabled', () => {
    const configDir = path.join(__dirname, '../config');
    const dbFile = path.join(configDir, 'statistics.db');
    
    // Clean up existing file if any
    if (fs.existsSync(dbFile)) {
      try { fs.unlinkSync(dbFile); } catch(e) {}
    }

    saveSettings({
      enableDatabaseLogs: true
    });
    
    initDb();
    insertLog('SYSTEM', 'INFO', 'Physical file test');
    
    expect(fs.existsSync(dbFile)).toBe(true);

    // Clean up
    initDb(); // switch back / release lock
    saveSettings({ enableDatabaseLogs: false });
    initDb();
    if (fs.existsSync(dbFile)) {
      try { fs.unlinkSync(dbFile); } catch(e) {}
    }
  });
});
