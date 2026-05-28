const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '../config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  port: 8888,
  loxoneIp: '192.168.1.10',
  loxonePort: 7777,
  ttsLanguage: 'de',
  staticSpeakerIps: [],
  roomAliases: {},
  enableDatabaseLogs: false
};

let currentSettings = { ...DEFAULT_SETTINGS };

/**
 * Ensures that the config directory exists.
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Loads settings from the configuration file.
 * If the file doesn't exist, it creates it with default values.
 */
function loadSettings() {
  try {
    ensureConfigDir();
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const loaded = JSON.parse(data);
      currentSettings = { ...DEFAULT_SETTINGS, ...loaded };
    } else {
      currentSettings = { ...DEFAULT_SETTINGS };
      saveSettings(currentSettings);
    }
  } catch (err) {
    console.error('Error loading settings, using defaults:', err);
    currentSettings = { ...DEFAULT_SETTINGS };
  }
  return currentSettings;
}

/**
 * Saves settings to the configuration file.
 * @param {Object} settings - The settings to save.
 */
function saveSettings(settings) {
  try {
    ensureConfigDir();
    currentSettings = { ...DEFAULT_SETTINGS, ...settings };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentSettings, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving settings:', err);
    return false;
  }
}

/**
 * Gets the current settings.
 */
function getSettings() {
  return currentSettings;
}

// Initial load
loadSettings();

module.exports = {
  getSettings,
  saveSettings,
  loadSettings,
  DEFAULT_SETTINGS
};
