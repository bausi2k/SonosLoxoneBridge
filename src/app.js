const express = require('express');
const path = require('path');
const { getSettings, saveSettings } = require('./settings');
const { 
  initializeSonos, 
  playRoom, 
  pauseRoom, 
  setRoomVolume, 
  playFavorite, 
  sayRoom, 
  getRoomStates, 
  getFavorites,
  getLocalIp
} = require('./sonos');
const { generateLoxoneXml } = require('./loxone');
const { cleanupTts } = require('./tts');

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Periodic TTS cleanup job (every 10 minutes, files older than 5 minutes)
const TTS_CLEANUP_INTERVAL = 10 * 60 * 1000;
let cleanupInterval = null;
if (process.env.NODE_ENV !== 'test') {
  cleanupInterval = setInterval(() => {
    cleanupTts(5 * 60 * 1000);
  }, TTS_CLEANUP_INTERVAL);
}

// ==========================================
// 1. INBOUND ROUTES (Loxone HTTP GET API)
// ==========================================

// GET /<raum>/play
app.get('/:raum/play', async (req, res) => {
  const { raum } = req.params;
  try {
    await playRoom(raum);
    res.json({ success: true, message: `Playback started in room "${raum}"` });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// GET /<raum>/pause
app.get('/:raum/pause', async (req, res) => {
  const { raum } = req.params;
  try {
    await pauseRoom(raum);
    res.json({ success: true, message: `Playback paused in room "${raum}"` });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// GET /<raum>/volume/<wert>
app.get('/:raum/volume/:wert', async (req, res) => {
  const { raum, wert } = req.params;
  try {
    const targetVolume = await setRoomVolume(raum, wert);
    res.json({ success: true, message: `Volume in room "${raum}" set to ${targetVolume}` });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// GET /<raum>/favorite/<name>
app.get('/:raum/favorite/:name', async (req, res) => {
  const { raum, name } = req.params;
  try {
    const playedTitle = await playFavorite(raum, name);
    res.json({ success: true, message: `Playing favorite "${playedTitle}" in room "${raum}"` });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// GET /<raum>/say/<text>/<volume> (volume is optional)
app.get('/:raum/say/:text/:volume?', async (req, res) => {
  const { raum, text, volume } = req.params;
  try {
    const url = await sayRoom(raum, text, volume);
    res.json({ success: true, message: `TTS announcement triggered in room "${raum}"`, url });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. FRONTEND REST API
// ==========================================

// GET /api/status
app.get('/api/status', (req, res) => {
  const settings = getSettings();
  const rooms = getRoomStates();
  res.json({
    success: true,
    settings,
    rooms,
    bridgeIp: settings.bridgeIp || getLocalIp()
  });
});

// GET /api/favorites/:room
app.get('/api/favorites/:room', async (req, res) => {
  const { room } = req.params;
  try {
    const favorites = await getFavorites(room);
    res.json({ success: true, favorites });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// POST /api/control
app.post('/api/control', async (req, res) => {
  const { room, action, value } = req.body;

  if (!room || !action) {
    return res.status(400).json({ success: false, error: 'Room and action are required' });
  }

  try {
    let message = '';
    switch (action) {
      case 'play':
        await playRoom(room);
        message = `Started playback in "${room}"`;
        break;
      case 'pause':
        await pauseRoom(room);
        message = `Paused playback in "${room}"`;
        break;
      case 'volume':
        const vol = await setRoomVolume(room, value);
        message = `Set volume in "${room}" to ${vol}`;
        break;
      case 'favorite':
        const fav = await playFavorite(room, value);
        message = `Playing favorite "${fav}" in "${room}"`;
        break;
      case 'say':
        if (typeof value === 'object' && value !== null) {
          await sayRoom(room, value.text, value.volume);
        } else {
          await sayRoom(room, value);
        }
        message = `Triggered announcement in "${room}"`;
        break;
      default:
        return res.status(400).json({ success: false, error: `Unknown action "${action}"` });
    }
    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings
app.post('/api/settings', async (req, res) => {
  const newSettings = req.body;
  const currentSettings = getSettings();

  const success = saveSettings(newSettings);
  if (!success) {
    return res.status(500).json({ success: false, error: 'Failed to write settings' });
  }

  // If static speaker IPs changed, re-initialize Sonos connection
  const ipListChanged = JSON.stringify(currentSettings.staticSpeakerIps) !== JSON.stringify(newSettings.staticSpeakerIps);
  if (ipListChanged) {
    console.log('[Sonos] Static IP configuration changed, re-initializing connection...');
    // Fire and forget re-init
    initializeSonos().catch(console.error);
  }

  res.json({ success: true, message: 'Settings saved successfully' });
});

// GET /api/loxone-export
app.get('/api/loxone-export', (req, res) => {
  const rooms = getRoomStates().map(r => r.name);
  const xml = generateLoxoneXml(rooms);
  
  res.setHeader('Content-disposition', 'attachment; filename=VIU_SonosLoxoneBridge.xml');
  res.setHeader('Content-type', 'text/xml');
  res.write(xml);
  res.end();
});

// POST /api/discover
app.post('/api/discover', async (req, res) => {
  try {
    await initializeSonos();
    res.json({ success: true, message: 'Sonos discovery completed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// Start server
const settings = getSettings();
const PORT = settings.port || 8888;

// Start server only when run directly
if (require.main === module) {
  initializeSonos()
    .then(() => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`[Bridge] SonosLoxoneBridge is running at http://localhost:${PORT}`);
        console.log(`[Bridge] Accessible locally via http://${getLocalIp()}:${PORT}`);
      });
    })
    .catch(err => {
      console.error('[Bridge] Failed to initialize Sonos bridge:', err);
    });
}

module.exports = app;
