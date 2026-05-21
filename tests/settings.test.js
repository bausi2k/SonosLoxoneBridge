const fs = require('fs');
const path = require('path');
const { getSettings, saveSettings, loadSettings, DEFAULT_SETTINGS } = require('../src/settings');

const CONFIG_FILE = path.join(__dirname, '../config/settings.json');

describe('Settings Management', () => {
  // Save original config if it exists
  let originalConfig = null;

  beforeAll(() => {
    if (fs.existsSync(CONFIG_FILE)) {
      originalConfig = fs.readFileSync(CONFIG_FILE, 'utf8');
    }
  });

  afterAll(() => {
    // Restore original config
    if (originalConfig !== null) {
      fs.writeFileSync(CONFIG_FILE, originalConfig, 'utf8');
    } else if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
  });

  beforeEach(() => {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    loadSettings();
  });

  test('should load default settings if config file does not exist', () => {
    const settings = getSettings();
    expect(settings.port).toBe(8888);
    expect(settings.ttsLanguage).toBe('de');
    expect(settings.loxonePort).toBe(7777);
  });

  test('should save and load modified settings', () => {
    const newSettings = {
      port: 9999,
      loxoneIp: '192.168.1.50',
      loxonePort: 8888,
      ttsLanguage: 'en',
      staticSpeakerIps: ['192.168.1.100'],
      roomAliases: { bad: 'Bathroom' }
    };

    const success = saveSettings(newSettings);
    expect(success).toBe(true);

    // Force reload from file
    const loaded = loadSettings();
    expect(loaded.port).toBe(9999);
    expect(loaded.loxoneIp).toBe('192.168.1.50');
    expect(loaded.loxonePort).toBe(8888);
    expect(loaded.ttsLanguage).toBe('en');
    expect(loaded.staticSpeakerIps).toContain('192.168.1.100');
    expect(loaded.roomAliases.bad).toBe('Bathroom');
  });
});
