const { hookConsole, info } = require('./logger');
const { initDb, getLogs, clearLogs } = require('./db');

// Hook console logs to capture system output
hookConsole();
// Initialize database (registers memory or file-based target based on settings)
initDb();

const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
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
  getLocalIp,
  formatError,
  nextTrack,
  previousTrack,
  setRoomPlayMode,
  playTuneIn,
  leaveGroup,
  playClip,
  sayAll,
  clipAll,
  applyPreset
} = require('./sonos');
const { generateLoxoneXml } = require('./loxone');
const { cleanupTts } = require('./tts');

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Middleware to log incoming API/Loxone control calls
app.use((req, res, next) => {
  // Skip static files or status/log poll to avoid spamming system logs
  if (
    req.path.startsWith('/css/') || 
    req.path.startsWith('/js/') || 
    req.path.startsWith('/clips/') || 
    req.path === '/api/status' || 
    req.path === '/api/logs' ||
    req.path === '/api/art' ||
    req.path === '/favicon.ico'
  ) {
    return next();
  }
  
  const { insertLog } = require('./db');
  const details = {
    method: req.method,
    ip: req.ip || req.connection.remoteAddress,
    query: req.query,
    body: req.method === 'POST' ? req.body : null
  };
  
  const message = `${req.method} ${req.originalUrl}`;
  insertLog('INBOUND', 'INFO', message, details);
  next();
});

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
  const priority = req.query.prio === 'true' || req.query.prio === '1';
  try {
    if (priority) {
      await playRoom(raum, true);
    } else {
      await playRoom(raum);
    }
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
  const priority = req.query.prio === 'true' || req.query.prio === '1';
  try {
    const targetVolume = priority ? await setRoomVolume(raum, wert, true) : await setRoomVolume(raum, wert);
    res.json({ success: true, message: `Volume in room "${raum}" set to ${targetVolume}` });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// GET /<raum>/favorite/<name>/<volume> (volume is optional)
app.get('/:raum/favorite/:name/:volume?', async (req, res) => {
  const { raum, name, volume } = req.params;
  const priority = req.query.prio === 'true' || req.query.prio === '1';
  try {
    const playedTitle = priority ? await playFavorite(raum, name, volume, true) : await playFavorite(raum, name, volume);
    res.json({ success: true, message: `Playing favorite "${playedTitle}" in room "${raum}"${volume ? ` with volume ${volume}%` : ''}` });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// GET /<raum>/say/<text>/<volume> (volume is optional)
app.get('/:raum/say/:text/:volume?', async (req, res) => {
  const { raum, text, volume } = req.params;
  const priority = req.query.prio === 'true' || req.query.prio === '1';
  try {
    const url = priority ? await sayRoom(raum, text, volume, true) : await sayRoom(raum, text, volume);
    res.json({ success: true, message: `TTS announcement triggered in room "${raum}"`, url });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// GET /<raum>/tunein/play/<stationId>
app.get('/:raum/tunein/play/:stationId', async (req, res) => {
  const { raum, stationId } = req.params;
  const priority = req.query.prio === 'true' || req.query.prio === '1';
  try {
    if (priority) {
      await playTuneIn(raum, stationId, true);
    } else {
      await playTuneIn(raum, stationId);
    }
    res.json({ success: true, message: `Playing TuneIn station ${stationId} in room "${raum}"` });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// GET /<raum>/leave
app.get('/:raum/leave', async (req, res) => {
  const { raum } = req.params;
  const priority = req.query.prio === 'true' || req.query.prio === '1';
  try {
    if (priority) {
      await leaveGroup(raum, true);
    } else {
      await leaveGroup(raum);
    }
    res.json({ success: true, message: `Room "${raum}" left group` });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// GET /<raum>/playpause
app.get('/:raum/playpause', async (req, res) => {
  const { raum } = req.params;
  const priority = req.query.prio === 'true' || req.query.prio === '1';
  try {
    const states = getRoomStates();
    const roomState = states.find(r => r.name.toLowerCase() === raum.toLowerCase());
    if (!roomState) {
      throw new Error(`Room "${raum}" not found`);
    }
    if (roomState.isPlaying) {
      await pauseRoom(raum);
      res.json({ success: true, message: `Paused in room "${raum}"` });
    } else {
      if (priority) {
        await playRoom(raum, true);
      } else {
        await playRoom(raum);
      }
      res.json({ success: true, message: `Started playing in room "${raum}"` });
    }
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// GET /<raum>/clip/<file>/<volume> (volume is optional)
app.get('/:raum/clip/:file/:volume?', async (req, res) => {
  const { raum, file, volume } = req.params;
  const priority = req.query.prio === 'true' || req.query.prio === '1';
  try {
    if (priority) {
      await playClip(raum, file, volume, true);
    } else {
      await playClip(raum, file, volume);
    }
    res.json({ success: true, message: `Playing audio clip "${file}" in room "${raum}"` });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// GET /sayall/<text>/<volume>
app.get('/sayall/:text/:volume?', async (req, res) => {
  const { text, volume } = req.params;
  try {
    await sayAll(text, volume);
    res.json({ success: true, message: `Global TTS announcement triggered: "${text}"` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /clipall/<file>/<volume>
app.get('/clipall/:file/:volume?', async (req, res) => {
  const { file, volume } = req.params;
  try {
    await clipAll(file, volume);
    res.json({ success: true, message: `Global audio clip played: "${file}"` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /preset/<name>
app.get('/preset/:name', async (req, res) => {
  const { name } = req.params;
  try {
    await applyPreset(name);
    res.json({ success: true, message: `Applied preset "${name}"` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. FRONTEND REST API
// ==========================================

// GET /api/status
app.get('/api/status', (req, res) => {
  const settings = getSettings();
  const rooms = getRoomStates();
  const pkg = require('../package.json');
  res.json({
    success: true,
    settings,
    rooms,
    bridgeIp: settings.bridgeIp || getLocalIp(),
    version: pkg.version
  });
});

// GET /api/art
app.get('/api/art', (req, res) => {
  const { ip, path: artPath } = req.query;

  if (!ip || !artPath) {
    return res.status(400).json({ success: false, error: 'ip and path query parameters are required' });
  }

  // Validate that the IP belongs to a known speaker to prevent SSRF
  const rooms = getRoomStates();
  const validIps = rooms.map(r => r.ip);
  if (!validIps.includes(ip)) {
    return res.status(403).json({ success: false, error: 'Unauthorized speaker IP address' });
  }

  // Ensure path starts with '/' and does not contain directory traversal attempts
  if (!artPath.startsWith('/') || artPath.includes('..')) {
    return res.status(400).json({ success: false, error: 'Invalid path' });
  }

  const targetUrl = `http://${ip}:1400${artPath}`;

  const proxyReq = http.get(targetUrl, (proxyRes) => {
    // Copy headers from Sonos speaker response
    if (proxyRes.headers['content-type']) {
      res.setHeader('content-type', proxyRes.headers['content-type']);
    }
    if (proxyRes.headers['content-length']) {
      res.setHeader('content-length', proxyRes.headers['content-length']);
    }
    if (proxyRes.headers['cache-control']) {
      res.setHeader('cache-control', proxyRes.headers['cache-control']);
    } else {
      res.setHeader('cache-control', 'public, max-age=3600');
    }
    res.statusCode = proxyRes.statusCode;
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Bridge Art Proxy Error] Failed to fetch artwork from ${targetUrl}:`, err.message);
    res.status(502).json({ success: false, error: `Failed to proxy artwork: ${err.message}` });
  });
});

// GET /api/favorites/:room
app.get('/api/favorites/:room', async (req, res) => {
  const { room } = req.params;
  try {
    const favorites = await getFavorites(room);
    res.json({ success: true, favorites });
  } catch (err) {
    const details = formatError(err);
    console.error('[Bridge Favorites API Error]:', details);
    res.status(404).json({ success: false, error: err.message, details });
  }
});

// POST /api/control
app.post('/api/control', async (req, res) => {
  const { room, action, value, priority, prio } = req.body;
  const isPrio = priority === true || prio === true || priority === 'true' || prio === 'true' || priority === 1 || prio === 1;

  if (!room || !action) {
    return res.status(400).json({ success: false, error: 'Room and action are required' });
  }

  try {
    let message = '';
    switch (action) {
      case 'play':
        if (isPrio) {
          await playRoom(room, true);
        } else {
          await playRoom(room);
        }
        message = `Started playback in "${room}"`;
        break;
      case 'pause':
        await pauseRoom(room);
        message = `Paused playback in "${room}"`;
        break;
      case 'volume':
        const vol = isPrio ? await setRoomVolume(room, value, true) : await setRoomVolume(room, value);
        message = `Set volume in "${room}" to ${vol}`;
        break;
      case 'favorite':
        const fav = isPrio ? await playFavorite(room, value, undefined, true) : await playFavorite(room, value);
        message = `Playing favorite "${fav}" in "${room}"`;
        break;
      case 'say':
        if (typeof value === 'object' && value !== null) {
          if (isPrio) {
            await sayRoom(room, value.text, value.volume, true);
          } else {
            await sayRoom(room, value.text, value.volume);
          }
        } else {
          if (isPrio) {
            await sayRoom(room, value, undefined, true);
          } else {
            await sayRoom(room, value);
          }
        }
        message = `Triggered announcement in "${room}"`;
        break;
      case 'next':
        if (isPrio) {
          await nextTrack(room, true);
        } else {
          await nextTrack(room);
        }
        message = `Skipped to next track in "${room}"`;
        break;
      case 'previous':
        if (isPrio) {
          await previousTrack(room, true);
        } else {
          await previousTrack(room);
        }
        message = `Skipped to previous track in "${room}"`;
        break;
      case 'playmode':
        if (isPrio) {
          await setRoomPlayMode(room, value, true);
        } else {
          await setRoomPlayMode(room, value);
        }
        message = `Set playmode in "${room}" to ${value}`;
        break;
      case 'leave':
        if (isPrio) {
          await leaveGroup(room, true);
        } else {
          await leaveGroup(room);
        }
        message = `Room "${room}" left its group`;
        break;
      default:
        return res.status(400).json({ success: false, error: `Unknown action "${action}"` });
    }
    res.json({ success: true, message });
  } catch (err) {
    const details = formatError(err);
    console.error('[Bridge Control API Error]:', details);
    res.status(500).json({ success: false, error: err.message, details });
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

  // If database logs configuration changed, re-initialize database
  if (currentSettings.enableDatabaseLogs !== newSettings.enableDatabaseLogs) {
    console.log(`[Database] Database logging configuration changed to: ${newSettings.enableDatabaseLogs}`);
    initDb();
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

// GET /api/presets
app.get('/api/presets', (req, res) => {
  const presetsDir = path.join(__dirname, '../presets');
  try {
    if (!fs.existsSync(presetsDir)) {
      fs.mkdirSync(presetsDir);
    }
    const files = fs.readdirSync(presetsDir);
    const presetsList = [];
    files.forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const presetData = JSON.parse(fs.readFileSync(path.join(presetsDir, file), 'utf8'));
          presetsList.push({
            name: path.basename(file, '.json'),
            config: presetData
          });
        } catch (e) {
          // Ignore invalid JSON files
        }
      }
    });
    res.json({ success: true, presets: presetsList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/presets
app.post('/api/presets', (req, res) => {
  const { name, config } = req.body;
  if (!name || !config) {
    return res.status(400).json({ success: false, error: 'Name and config are required' });
  }
  
  // Safe filename check
  const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const presetsDir = path.join(__dirname, '../presets');
  const targetPath = path.join(presetsDir, `${safeName}.json`);
  
  try {
    if (!fs.existsSync(presetsDir)) {
      fs.mkdirSync(presetsDir);
    }
    fs.writeFileSync(targetPath, JSON.stringify(config, null, 2), 'utf8');
    res.json({ success: true, message: `Preset "${safeName}" saved successfully`, name: safeName });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/presets/:name
app.delete('/api/presets/:name', (req, res) => {
  const { name } = req.params;
  const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const presetsDir = path.join(__dirname, '../presets');
  const targetPath = path.join(presetsDir, `${safeName}.json`);
  
  try {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      res.json({ success: true, message: `Preset "${safeName}" deleted successfully` });
    } else {
      res.status(404).json({ success: false, error: `Preset "${safeName}" not found` });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/discover
app.post('/api/discover', async (req, res) => {
  try {
    await initializeSonos();
    res.json({ success: true, message: 'Sonos discovery completed' });
  } catch (err) {
    const details = formatError(err);
    console.error('[Bridge Discover API Error]:', details);
    res.status(500).json({ success: false, error: err.message, details });
  }
});

// GET /api/logs
app.get('/api/logs', (req, res) => {
  const { category, days, level } = req.query;
  const logs = getLogs({ category, days, level });
  res.json({ success: true, logs });
});

// POST /api/logs/clear
app.post('/api/logs/clear', (req, res) => {
  const success = clearLogs();
  if (success) {
    console.log('[Bridge] System-Protokoll gelöscht.');
    res.json({ success: true, message: 'Logs cleared successfully' });
  } else {
    res.status(500).json({ success: false, error: 'Failed to clear logs' });
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
