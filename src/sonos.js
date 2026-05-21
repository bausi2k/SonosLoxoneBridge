const os = require('os');
const { SonosManager, SonosDevice } = require('@svrooij/sonos');
const { getSettings } = require('./settings');
const { normalizeRoomName, sendPlayStatus, sendVolumeStatus } = require('./loxone');
const { generateTts } = require('./tts');

let devices = [];
let manager = null;
let pollInterval = null;

// Track previous states to avoid redundant UDP packets
const deviceStates = {};

/**
 * Returns the local LAN IP address of this machine.
 * Useful for building the local callback URL for Sonos speakers.
 * @returns {string} The local IPv4 address.
 */
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Handle Node 18+ family format
      const isIPv4 = iface.family === 'IPv4' || iface.family === 4;
      if (isIPv4 && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Fetches volume and play status for a device and updates state.
 * @param {SonosDevice} device - The Sonos device.
 */
async function updateDeviceState(device) {
  const norm = normalizeRoomName(device.Name);
  try {
    const volRes = await device.RenderingControlService.GetVolume({ InstanceID: 0, Channel: 'Master' });
    const volume = parseInt(volRes.CurrentVolume, 10);
    const transportInfo = await device.AVTransportService.GetTransportInfo({ InstanceID: 0 });
    const isPlaying = transportInfo.CurrentTransportState === 'PLAYING';
    
    deviceStates[norm] = { volume, isPlaying };
  } catch (err) {
    console.warn(`[Sonos] Failed to fetch initial state for speaker "${device.Name}":`, err.message);
    deviceStates[norm] = { volume: 0, isPlaying: false };
  }
}

/**
 * Initializes the Sonos devices.
 * Supports static IP list as fallback or SSDP auto-discovery.
 */
async function initializeSonos() {
  const settings = getSettings();
  const staticIps = settings.staticSpeakerIps || [];

  devices = [];
  manager = null;

  if (staticIps.length > 0) {
    console.log(`[Sonos] Initializing with ${staticIps.length} static IP(s)...`);
    for (const ip of staticIps) {
      try {
        const device = new SonosDevice(ip);
        await device.LoadDeviceData();
        devices.push(device);
        console.log(`[Sonos] Added static speaker: "${device.Name}" (${ip})`);
      } catch (err) {
        console.error(`[Sonos] Failed to connect to static speaker at ${ip}:`, err.message);
      }
    }
  } else {
    console.log('[Sonos] Starting auto-discovery (SSDP)...');
    try {
      manager = new SonosManager();
      // Discover speakers for 5 seconds
      await manager.InitializeWithDiscovery(5);
      devices = manager.Devices;
      console.log(`[Sonos] Auto-discovery found ${devices.length} speaker(s).`);
    } catch (err) {
      console.error('[Sonos] Auto-discovery failed:', err);
    }
  }

  // Initial state record (set defaults)
  devices.forEach(d => {
    deviceStates[normalizeRoomName(d.Name)] = { volume: 0, isPlaying: false };
  });

  // Query speaker state asynchronously so we don't block server startup
  Promise.all(devices.map(d => updateDeviceState(d)))
    .then(() => {
      console.log('[Sonos] Initial speaker states loaded successfully.');
    })
    .catch(err => {
      console.error('[Sonos] Error loading initial speaker states:', err);
    });

  startPolling();
}

/**
 * Finds a Sonos device by its room name.
 * Respects aliases and normalizes room names.
 * @param {string} roomName - The requested room name.
 * @returns {SonosDevice} The matched Sonos device.
 * @throws {Error} If device is not found.
 */
function getDevice(roomName) {
  const settings = getSettings();
  const normName = normalizeRoomName(roomName);

  // Check aliases first
  let targetRoom = normName;
  if (settings.roomAliases && settings.roomAliases[normName]) {
    targetRoom = normalizeRoomName(settings.roomAliases[normName]);
  }

  const device = devices.find(d => normalizeRoomName(d.Name) === targetRoom);
  if (!device) {
    throw new Error(`Speaker for room "${roomName}" not found. Available rooms: ${devices.map(d => d.Name).join(', ')}`);
  }
  return device;
}

/**
 * Periodically polls the speaker states and sends updates to Loxone.
 */
async function pollStates() {
  for (const device of devices) {
    const norm = normalizeRoomName(device.Name);
    try {
      // 1. Get Volume
      const volRes = await device.RenderingControlService.GetVolume({ InstanceID: 0, Channel: 'Master' });
      const volume = parseInt(volRes.CurrentVolume, 10);
      
      // 2. Get Play State
      const transportInfo = await device.AVTransportService.GetTransportInfo({ InstanceID: 0 });
      const isPlaying = transportInfo.CurrentTransportState === 'PLAYING';

      // 3. Compare and send if changed
      const prev = deviceStates[norm] || { volume: -1, isPlaying: null };
      if (prev.volume !== volume) {
        sendVolumeStatus(device.Name, volume);
        prev.volume = volume;
      }
      if (prev.isPlaying !== isPlaying) {
        sendPlayStatus(device.Name, isPlaying);
        prev.isPlaying = isPlaying;
      }
      deviceStates[norm] = prev;
    } catch (err) {
      // Silent error during polling (speaker offline, etc.)
    }
  }
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  // Poll every 5 seconds
  pollInterval = setInterval(pollStates, 5000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/**
 * Triggers play on a room speaker.
 */
async function playRoom(roomName) {
  const device = getDevice(roomName);
  await device.Play();
  
  // Instant Loxone UDP notification
  const norm = normalizeRoomName(device.Name);
  if (deviceStates[norm]) deviceStates[norm].isPlaying = true;
  sendPlayStatus(device.Name, true);
}

/**
 * Triggers pause on a room speaker.
 */
async function pauseRoom(roomName) {
  const device = getDevice(roomName);
  await device.Pause();

  // Instant Loxone UDP notification
  const norm = normalizeRoomName(device.Name);
  if (deviceStates[norm]) deviceStates[norm].isPlaying = false;
  sendPlayStatus(device.Name, false);
}

/**
 * Adjusts volume of a room speaker.
 * Supports absolute values (e.g. 30) or relative values (e.g. "+5", "-10").
 */
async function setRoomVolume(roomName, volumeVal) {
  const device = getDevice(roomName);
  const volRes = await device.RenderingControlService.GetVolume({ InstanceID: 0, Channel: 'Master' });
  const currentVolume = parseInt(volRes.CurrentVolume, 10);
  
  let targetVolume = currentVolume;
  const valStr = String(volumeVal).trim();

  if (valStr.startsWith('+') || valStr.startsWith('-')) {
    targetVolume += parseInt(valStr, 10);
  } else {
    targetVolume = parseInt(valStr, 10);
  }

  // Constrain to [0, 100]
  targetVolume = Math.max(0, Math.min(100, targetVolume));

  await device.SetVolume(targetVolume);

  // Instant Loxone UDP notification
  const norm = normalizeRoomName(device.Name);
  if (deviceStates[norm]) deviceStates[norm].volume = targetVolume;
  sendVolumeStatus(device.Name, targetVolume);

  return targetVolume;
}

/**
 * Retrieves favorites from a speaker.
 */
async function getFavorites(roomName) {
  const device = getDevice(roomName);
  const response = await device.ContentDirectoryService.BrowseParsedWithDefaults('FV:2');
  return response.Result || response;
}

/**
 * Plays a favorite by name.
 */
async function playFavorite(roomName, favoriteName) {
  const device = getDevice(roomName);
  const favorites = await getFavorites(roomName);

  // Find favorite case-insensitively
  const fav = favorites.find(f => f.Title && f.Title.toLowerCase().trim() === favoriteName.toLowerCase().trim());
  if (!fav) {
    throw new Error(`Favorite "${favoriteName}" not found in room "${roomName}".`);
  }

  // Set URI
  await device.AVTransportService.SetAVTransportURI({
    InstanceID: 0,
    CurrentURI: fav.Uri || fav.uri,
    CurrentURIMetaData: fav.MetaData || fav.metadata || ''
  });

  // Play
  await device.Play();

  // Instant Loxone UDP notification
  const norm = normalizeRoomName(device.Name);
  if (deviceStates[norm]) deviceStates[norm].isPlaying = true;
  sendPlayStatus(device.Name, true);

  return fav.Title;
}

/**
 * Performs Text-To-Speech.
 */
async function sayRoom(roomName, text, volumeVal) {
  const device = getDevice(roomName);
  const settings = getSettings();

  // 1. Generate local MP3
  const filename = await generateTts(text, settings.ttsLanguage);

  // 2. Build local url
  const port = settings.port || 8888;
  const ip = settings.bridgeIp || getLocalIp();
  const ttsUrl = `http://${ip}:${port}/temp/tts/${filename}`;

  // 3. Play as notification
  const vol = volumeVal ? parseInt(volumeVal, 10) : undefined;
  
  await device.PlayNotification({
    trackUri: ttsUrl,
    volume: vol,
    timeout: 20, // Revert after 20 seconds maximum if event is lost
    onlyWhenPlaying: false
  });

  return ttsUrl;
}

/**
 * Gets a clean array of currently loaded device rooms.
 */
function getActiveRooms() {
  return devices.map(d => d.Name);
}

/**
 * Gets detailed room states including IP, volume, and playback state.
 */
function getRoomStates() {
  return devices.map(d => {
    const norm = normalizeRoomName(d.Name);
    const state = deviceStates[norm] || { volume: -1, isPlaying: null };
    return {
      name: d.Name,
      ip: d.ip || d.host || 'LAN',
      volume: state.volume === -1 ? 0 : state.volume,
      isPlaying: !!state.isPlaying
    };
  });
}

module.exports = {
  initializeSonos,
  getLocalIp,
  getDevice,
  playRoom,
  pauseRoom,
  setRoomVolume,
  getFavorites,
  playFavorite,
  sayRoom,
  getActiveRooms,
  getRoomStates,
  stopPolling
};
