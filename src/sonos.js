const os = require('os');
const http = require('http');
const { SonosManager, SonosDevice, MetaDataHelper } = require('@svrooij/sonos');
const { getSettings } = require('./settings');
const { normalizeRoomName, sendPlayStatus, sendVolumeStatus } = require('./loxone');
const { generateTts } = require('./tts');

let devices = [];
let manager = null;
let pollInterval = null;

// Track previous states to avoid redundant UDP packets
const deviceStates = {};

/**
 * Utility to extract all details of an error object (including SOAP/network properties)
 * and return a JSON-friendly object.
 * @param {Error} err - The error object.
 * @returns {object|null} Formatted error object.
 */
function formatError(err) {
  if (!err) return null;
  const result = {
    message: err.message,
    name: err.name,
    stack: err.stack
  };

  try {
    for (const key of Object.getOwnPropertyNames(err)) {
      if (key === 'stack' || key === 'message' || key === 'name') continue;
      const val = err[key];
      if (typeof val === 'function') continue;

      if (key === 'response') {
        if (val && typeof val === 'object') {
          result.response = {
            status: val.status,
            statusText: val.statusText,
            headers: val.headers,
            data: val.data
          };
        }
      } else if (key === 'request') {
        if (val && typeof val === 'object') {
          result.request = {
            url: val.url,
            method: val.method,
            headers: val.headers
          };
        }
      } else {
        result[key] = val;
      }
    }
  } catch (e) {
    result.formatErrorFailed = e.message;
  }

  return result;
}

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
 * Lädt asynchron die Diagnoseinformationen für ein Sonos-Gerät
 * und speichert sie auf dem device-Objekt unter `diagnostics`.
 * @param {SonosDevice} device 
 */
async function loadDeviceDiagnostics(device) {
  if (device.diagnostics) return;
  try {
    const [zoneInfo, desc] = await Promise.all([
      device.GetZoneInfo().catch(() => ({})),
      device.GetDeviceDescription().catch(() => ({}))
    ]);

    device.diagnostics = {
      modelName: desc.modelName || desc.modelDescription || 'Sonos-Lautsprecher',
      modelNumber: desc.modelNumber || '',
      softwareVersion: zoneInfo.SoftwareVersion || desc.softwareVersion || '',
      displayVersion: zoneInfo.DisplaySoftwareVersion ? String(zoneInfo.DisplaySoftwareVersion) : (desc.displayVersion || ''),
      serialNumber: zoneInfo.SerialNumber || desc.serialNumber || '',
      macAddress: zoneInfo.MACAddress || ''
    };
  } catch (err) {
    console.warn(`[Sonos] Fehler beim Laden der Diagnose für "${device.Name}":`, err.message);
    device.diagnostics = {
      modelName: 'Sonos-Lautsprecher',
      modelNumber: '',
      softwareVersion: '',
      displayVersion: '',
      serialNumber: '',
      macAddress: ''
    };
  }
}

/**
 * Fetches raw battery status XML from a Sonos speaker.
 * @param {string} ip - The IP address of the speaker.
 * @returns {Promise<string>} The raw XML response.
 */
function fetchBatteryStatus(ip) {
  return new Promise((resolve, reject) => {
    const options = {
      host: ip,
      port: 1400,
      path: '/status/batterystatus',
      timeout: 1500
    };

    const req = http.get(options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP status code ${res.statusCode}`));
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve(data);
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Parses raw battery status XML to extract level and charging status.
 * @param {string} xmlString - The raw battery XML.
 * @returns {object|null} { level: number, isCharging: boolean } or null.
 */
function parseBatteryXml(xmlString) {
  if (!xmlString || !xmlString.includes('<LocalBatteryStatus>')) {
    return null;
  }

  const levelMatch = xmlString.match(/<Data[^>]*name=["']Level["'][^>]*>([^<]+)<\/Data>/i);
  const powerSourceMatch = xmlString.match(/<Data[^>]*name=["']PowerSource["'][^>]*>([^<]+)<\/Data>/i);

  if (!levelMatch) {
    return null;
  }

  const level = parseInt(levelMatch[1].trim(), 10);
  const powerSource = powerSourceMatch ? powerSourceMatch[1].trim() : 'battery';
  const isCharging = powerSource.toLowerCase() !== 'battery';

  return {
    level,
    isCharging
  };
}

/**
 * Asynchronously updates the battery status of a device in the background.
 * @param {SonosDevice} device - The Sonos device.
 */
async function updateDeviceBatteryStatus(device) {
  if (device.batterySupported === false) {
    return;
  }

  const ip = device.ip || device.host;
  if (!ip) return;

  const norm = normalizeRoomName(device.Name);

  try {
    const xml = await fetchBatteryStatus(ip);
    const result = parseBatteryXml(xml);

    if (result) {
      device.batterySupported = true;
      if (!deviceStates[norm]) {
        deviceStates[norm] = {};
      }
      deviceStates[norm].batteryLevel = result.level;
      deviceStates[norm].isCharging = result.isCharging;
    } else {
      device.batterySupported = false;
      if (deviceStates[norm]) {
        deviceStates[norm].batteryLevel = null;
        deviceStates[norm].isCharging = false;
      }
    }
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('status code 404') || msg.includes('ECONNREFUSED')) {
      device.batterySupported = false;
      if (deviceStates[norm]) {
        deviceStates[norm].batteryLevel = null;
        deviceStates[norm].isCharging = false;
      }
    }
  }
}

/**
 * Fetches volume and play status for a device and updates state.
 * @param {SonosDevice} device - The Sonos device.
 */
async function updateDeviceState(device) {
  const norm = normalizeRoomName(device.Name);
  try {
    if (!device.diagnostics) {
      loadDeviceDiagnostics(device).catch(() => {});
    }
    const volRes = await device.RenderingControlService.GetVolume({ InstanceID: 0, Channel: 'Master' });
    const volume = parseInt(volRes.CurrentVolume, 10);
    const transportInfo = await device.AVTransportService.GetTransportInfo({ InstanceID: 0 });
    const isPlaying = transportInfo.CurrentTransportState === 'PLAYING';
    
    let currentTrack = null;
    try {
      const posInfo = await device.AVTransportService.GetPositionInfo({ InstanceID: 0 });
      currentTrack = parseTrackInfo(posInfo);
    } catch (e) {
      // ignore
    }

    let playMode = 'NORMAL';
    try {
      const settings = await device.AVTransportService.GetTransportSettings({ InstanceID: 0 });
      playMode = settings.PlayMode || 'NORMAL';
    } catch (e) {
      // ignore
    }
    
    const prev = deviceStates[norm] || {};
    deviceStates[norm] = {
      volume,
      isPlaying,
      currentTrack,
      playMode,
      batteryLevel: prev.batteryLevel !== undefined ? prev.batteryLevel : null,
      isCharging: prev.isCharging !== undefined ? prev.isCharging : false
    };

    updateDeviceBatteryStatus(device).catch(() => {});
  } catch (err) {
    console.warn(`[Sonos] Failed to fetch initial state for speaker "${device.Name}":`, err.message);
    const prev = deviceStates[norm] || {};
    deviceStates[norm] = {
      volume: 0,
      isPlaying: false,
      currentTrack: null,
      playMode: 'NORMAL',
      batteryLevel: prev.batteryLevel !== undefined ? prev.batteryLevel : null,
      isCharging: prev.isCharging !== undefined ? prev.isCharging : false
    };
    updateDeviceBatteryStatus(device).catch(() => {});
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
    deviceStates[normalizeRoomName(d.Name)] = { volume: 0, isPlaying: false, currentTrack: null };
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
      if (!device.diagnostics) {
        loadDeviceDiagnostics(device).catch(() => {});
      }
      // 1. Get Volume
      const volRes = await device.RenderingControlService.GetVolume({ InstanceID: 0, Channel: 'Master' });
      const volume = parseInt(volRes.CurrentVolume, 10);
      
      // 2. Get Play State
      const transportInfo = await device.AVTransportService.GetTransportInfo({ InstanceID: 0 });
      const isPlaying = transportInfo.CurrentTransportState === 'PLAYING';

      // 3. Get Track Info
      let currentTrack = null;
      try {
        const posInfo = await device.AVTransportService.GetPositionInfo({ InstanceID: 0 });
        currentTrack = parseTrackInfo(posInfo);
      } catch (e) {
        // ignore
      }

      // Get PlayMode
      let playMode = 'NORMAL';
      try {
        const settings = await device.AVTransportService.GetTransportSettings({ InstanceID: 0 });
        playMode = settings.PlayMode || 'NORMAL';
      } catch (e) {
        // ignore
      }

      // 4. Compare and send if changed
      const prev = deviceStates[norm] || { volume: -1, isPlaying: null, currentTrack: null, playMode: 'NORMAL', batteryLevel: null, isCharging: false };
      if (prev.volume !== volume) {
        sendVolumeStatus(device.Name, volume);
        prev.volume = volume;
      }
      if (prev.isPlaying !== isPlaying) {
        sendPlayStatus(device.Name, isPlaying);
        prev.isPlaying = isPlaying;
      }
      prev.currentTrack = currentTrack;
      prev.playMode = playMode;
      deviceStates[norm] = prev;
      updateDeviceBatteryStatus(device).catch(() => {});
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
  console.log(`[Sonos Debug] playRoom called for room "${roomName}"`);
  try {
    const device = getDevice(roomName);
    console.log(`[Sonos Debug] Device found: ${device.Name}. Sending Play command...`);
    await device.Play();
    console.log(`[Sonos Debug] Play command successful for "${device.Name}".`);
    
    // Instant Loxone UDP notification
    const norm = normalizeRoomName(device.Name);
    if (deviceStates[norm]) deviceStates[norm].isPlaying = true;
    sendPlayStatus(device.Name, true);
  } catch (err) {
    const is701 = err.UpnpErrorCode === 701 || (err.message && (err.message.includes('701') || err.message.includes('Transition not available')));
    if (is701) {
      console.log(`[Sonos Debug] Play failed with Transition not available (701) in room "${roomName}". Attempting fallback...`);
      
      // Fallback 1: Try playing the first favorite
      try {
        const favorites = await getFavorites(roomName);
        if (favorites && favorites.length > 0) {
          const firstFav = favorites[0].Title;
          console.log(`[Sonos Debug] Fallback: Playing first favorite "${firstFav}" in room "${roomName}"...`);
          await playFavorite(roomName, firstFav);
          console.log(`[Sonos Debug] Fallback to first favorite succeeded in room "${roomName}".`);
          return;
        }
      } catch (favErr) {
        console.warn(`[Sonos Debug] Fallback to first favorite failed in room "${roomName}":`, formatError(favErr));
      }

      // Fallback 2: Try switching to queue and playing
      try {
        console.log(`[Sonos Debug] Fallback: Switching to queue and playing in room "${roomName}"...`);
        const device = getDevice(roomName);
        await device.SwitchToQueue();
        await device.Play();
        console.log(`[Sonos Debug] Fallback to queue playback succeeded in room "${roomName}".`);
        
        // Instant Loxone UDP notification
        const norm = normalizeRoomName(device.Name);
        if (deviceStates[norm]) deviceStates[norm].isPlaying = true;
        sendPlayStatus(device.Name, true);
        return;
      } catch (queueErr) {
        console.warn(`[Sonos Debug] Fallback to queue playback failed in room "${roomName}":`, formatError(queueErr));
      }
    }

    console.error(`[Sonos Debug] Error in playRoom for room "${roomName}":`, formatError(err));
    throw err;
  }
}

async function pauseRoom(roomName) {
  console.log(`[Sonos Debug] pauseRoom called for room "${roomName}"`);
  try {
    const device = getDevice(roomName);
    console.log(`[Sonos Debug] Device found: ${device.Name}. Sending Pause command...`);
    await device.Pause();
    console.log(`[Sonos Debug] Pause command successful for "${device.Name}".`);

    // Instant Loxone UDP notification
    const norm = normalizeRoomName(device.Name);
    if (deviceStates[norm]) deviceStates[norm].isPlaying = false;
    sendPlayStatus(device.Name, false);
  } catch (err) {
    console.error(`[Sonos Debug] Error in pauseRoom for room "${roomName}":`, formatError(err));
    throw err;
  }
}

/**
 * Adjusts volume of a room speaker.
 * Supports absolute values (e.g. 30) or relative values (e.g. "+5", "-10").
 */
async function setRoomVolume(roomName, volumeVal) {
  console.log(`[Sonos Debug] setRoomVolume called for room "${roomName}", volumeVal: "${volumeVal}"`);
  try {
    const device = getDevice(roomName);
    const volRes = await device.RenderingControlService.GetVolume({ InstanceID: 0, Channel: 'Master' });
    const currentVolume = parseInt(volRes.CurrentVolume, 10);
    console.log(`[Sonos Debug] Device "${device.Name}" current volume: ${currentVolume}`);
    
    let targetVolume = currentVolume;
    const valStr = String(volumeVal).trim();

    if (valStr.startsWith('+') || valStr.startsWith('-')) {
      targetVolume += parseInt(valStr, 10);
    } else {
      targetVolume = parseInt(valStr, 10);
    }

    // Constrain to [0, 100]
    targetVolume = Math.max(0, Math.min(100, targetVolume));
    console.log(`[Sonos Debug] Setting volume on "${device.Name}" to: ${targetVolume}`);

    await device.SetVolume(targetVolume);
    console.log(`[Sonos Debug] SetVolume successful on "${device.Name}".`);

    // Instant Loxone UDP notification
    const norm = normalizeRoomName(device.Name);
    if (deviceStates[norm]) deviceStates[norm].volume = targetVolume;
    sendVolumeStatus(device.Name, targetVolume);

    return targetVolume;
  } catch (err) {
    console.error(`[Sonos Debug] Error in setRoomVolume for room "${roomName}":`, formatError(err));
    throw err;
  }
}

/**
 * Skips to the next track in the queue for a room.
 */
async function nextTrack(roomName) {
  console.log(`[Sonos Debug] nextTrack called for room "${roomName}"`);
  try {
    const device = getDevice(roomName);
    await device.Next();
    console.log(`[Sonos Debug] Next track command successful for "${device.Name}".`);
  } catch (err) {
    console.error(`[Sonos Debug] Error in nextTrack for room "${roomName}":`, formatError(err));
    throw err;
  }
}

/**
 * Skips to the previous track in the queue for a room.
 */
async function previousTrack(roomName) {
  console.log(`[Sonos Debug] previousTrack called for room "${roomName}"`);
  try {
    const device = getDevice(roomName);
    await device.Previous();
    console.log(`[Sonos Debug] Previous track command successful for "${device.Name}".`);
  } catch (err) {
    console.error(`[Sonos Debug] Error in previousTrack for room "${roomName}":`, formatError(err));
    throw err;
  }
}

/**
 * Sets the playback mode (shuffle, repeat) for a room.
 * @param {string} roomName - Room name.
 * @param {string} playMode - One of NORMAL, REPEAT_ALL, SHUFFLE_NOREPEAT, SHUFFLE, REPEAT_ONE.
 */
async function setRoomPlayMode(roomName, playMode) {
  console.log(`[Sonos Debug] setRoomPlayMode called for room "${roomName}", playMode: "${playMode}"`);
  try {
    const device = getDevice(roomName);
    await device.AVTransportService.SetPlayMode({ InstanceID: 0, NewPlayMode: playMode });
    console.log(`[Sonos Debug] SetPlayMode successful on "${device.Name}" to: ${playMode}`);
    
    // Update local state immediately
    const norm = normalizeRoomName(device.Name);
    if (deviceStates[norm]) {
      deviceStates[norm].playMode = playMode;
    }
  } catch (err) {
    console.error(`[Sonos Debug] Error in setRoomPlayMode for room "${roomName}":`, formatError(err));
    throw err;
  }
}


/**
 * Unescapes XML entities exactly once.
 * Replaces &amp; last to prevent double-unescaping in a single pass.
 * @param {string} safe - The XML string.
 * @returns {string} The unescaped string.
 */
function unescapeXmlOnce(safe) {
  if (!safe) return '';
  return safe
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Unescapes XML entities recursively/standardly.
 * @param {string} safe - The XML string.
 * @returns {string} The unescaped string.
 */
function unescapeXml(safe) {
  if (!safe) return '';
  return safe
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Safely parses track information from raw position info result.
 * @param {object} posInfo - Result of GetPositionInfo
 * @returns {object|null} Parsed track info or null
 */
function parseTrackInfo(posInfo) {
  if (!posInfo || !posInfo.TrackMetaData) {
    return null;
  }
  try {
    const meta = posInfo.TrackMetaData;

    // Check if TrackMetaData has been pre-parsed as an object by the library
    if (typeof meta === 'object' && meta !== null) {
      return {
        title: meta.Title || '',
        artist: meta.Artist || '',
        streamContent: meta.streamContent || meta.StreamContent || '',
        albumArt: meta.AlbumArtUri || meta.albumArtURI || meta.AlbumArt || meta.AlbumArtURI || '',
        duration: posInfo.TrackDuration || meta.Duration || ''
      };
    }

    // Fallback: Parse XML string using regex matching
    const xml = unescapeXmlOnce(meta);
    
    const titleMatch = xml.match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/);
    const title = titleMatch ? unescapeXmlOnce(titleMatch[1]) : '';
    
    const artistMatch = xml.match(/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/);
    const artist = artistMatch ? unescapeXmlOnce(artistMatch[1]) : '';
    
    const streamMatch = xml.match(/<r:streamContent\b[^>]*>([\s\S]*?)<\/r:streamContent>/);
    const streamContent = streamMatch ? unescapeXmlOnce(streamMatch[1]) : '';
    
    const artMatch = xml.match(/<upnp:albumArtURI\b[^>]*>([\s\S]*?)<\/upnp:albumArtURI>/);
    const albumArt = artMatch ? unescapeXmlOnce(artMatch[1]) : '';

    return {
      title,
      artist,
      streamContent,
      albumArt,
      duration: posInfo.TrackDuration || ''
    };
  } catch (err) {
    return null;
  }
}

/**
 * Retrieves favorites from a speaker.
 */
async function getFavorites(roomName) {
  const device = getDevice(roomName);
  const response = await device.ContentDirectoryService.Browse({
    ObjectID: 'FV:2',
    BrowseFlag: 'BrowseDirectChildren',
    Filter: '*',
    StartingIndex: 0,
    RequestedCount: 100,
    SortCriteria: ''
  });

  if (!response || !response.Result) {
    return [];
  }

  const xml = unescapeXmlOnce(response.Result);
  const itemRegex = /<item\s+[^>]*>([\s\S]*?)<\/item>/g;
  let match;

  const parsedFavorites = [];

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    
    // Extract dc:title
    const titleMatch = content.match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/);
    const title = titleMatch ? unescapeXmlOnce(titleMatch[1]) : '';
    
    // Extract res (URI)
    const resMatch = content.match(/<res[^>]*>([\s\S]*?)<\/res>/);
    const uri = resMatch ? unescapeXmlOnce(resMatch[1]) : '';

    // Extract upnp:class
    const classMatch = content.match(/<upnp:class\b[^>]*>([^<]+)<\/upnp:class>/);
    const upnpClass = classMatch ? classMatch[1] : '';

    // Extract r:resMD (Metadata)
    const mdMatch = content.match(/<r:resMD\b[^>]*>([\s\S]*?)<\/r:resMD>/);
    let trackObj = null;
    if (mdMatch) {
      const rawMetadata = unescapeXml(mdMatch[1]);
      
      const idMatch = rawMetadata.match(/<item id="([^"]+)"/);
      const parentIdMatch = rawMetadata.match(/parentID="([^"]+)"/);
      const subClassMatch = rawMetadata.match(/<upnp:class\b[^>]*>([^<]+)<\/upnp:class>/);
      const cdudnMatch = rawMetadata.match(/<desc id="cdudn"[^>]*>([^<]+)<\/desc>/);
      const artMatch = rawMetadata.match(/<upnp:albumArtURI\b[^>]*>([^<]+)<\/upnp:albumArtURI>/);

      trackObj = {
        ItemId: idMatch ? idMatch[1] : undefined,
        ParentId: parentIdMatch ? parentIdMatch[1] : undefined,
        UpnpClass: subClassMatch ? subClassMatch[1] : undefined,
        CdUdn: cdudnMatch ? cdudnMatch[1] : undefined,
        AlbumArtUri: artMatch ? artMatch[1] : undefined,
        Title: title
      };
    }

    parsedFavorites.push({
      Title: title,
      Uri: uri,
      UpnpClass: upnpClass,
      TrackMetadata: trackObj
    });
  }

  return parsedFavorites;
}

/**
 * Plays a favorite by name.
 */
async function playFavorite(roomName, favoriteName) {
  console.log(`[Sonos Debug] playFavorite called for room "${roomName}", favorite: "${favoriteName}"`);
  try {
    const device = getDevice(roomName);
    console.log(`[Sonos Debug] Found device: ${device.Name}`);
    
    const favorites = await getFavorites(roomName);
    console.log(`[Sonos Debug] Discovered favorites:`, favorites.map(f => f.Title));
    
    // Find favorite case-insensitively
    const fav = favorites.find(f => f.Title && f.Title.toLowerCase().trim() === favoriteName.toLowerCase().trim());
    if (!fav) {
      console.error(`[Sonos Debug] Favorite "${favoriteName}" not found in room "${roomName}".`);
      throw new Error(`Favorite "${favoriteName}" not found in room "${roomName}".`);
    }

    const uri = fav.Uri;
    const trackObj = fav.TrackMetadata;

    // Determine container vs stream from the INNER metadata class and URI prefix.
    // The outer fav.UpnpClass is always the generic 'sonos-favorite' class.
    const innerClass = (trackObj && trackObj.UpnpClass) || '';
    const isContainer = innerClass.startsWith('object.container.') ||
                        uri.startsWith('x-rincon-cpcontainer:');
    console.log(`[Sonos Debug] Playing favorite "${fav.Title}" (isContainer: ${isContainer})`);
    console.log(`[Sonos Debug] URI: "${uri}"`);
    console.log(`[Sonos Debug] trackObj:`, JSON.stringify(trackObj));

    if (isContainer) {
      // 1. Clear queue
      try {
        console.log(`[Sonos Debug] Clearing queue for container playback...`);
        await device.AVTransportService.RemoveAllTracksFromQueue({ InstanceID: 0 });
        console.log(`[Sonos Debug] Queue cleared successfully.`);
      } catch (e) {
        console.log(`[Sonos Debug] Clear queue failed (ignoring):`, e.message);
      }
      
      // 2. Add container to queue – pass trackObj as an object so the library's
      //    SOAP serializer calls TrackToMetaData() + EncodeXml() internally.
      const metadataObj = trackObj || '';
      console.log(`[Sonos Debug] Adding container to queue with metadata object...`);
      
      console.log(`[Sonos Debug] Calling AddURIToQueue...`);
      const queueRes = await device.AVTransportService.AddURIToQueue({
        InstanceID: 0,
        EnqueuedURI: uri,
        EnqueuedURIMetaData: metadataObj,
        DesiredFirstTrackNumberEnqueued: 1,
        EnqueueAsNext: true
      });
      console.log(`[Sonos Debug] AddURIToQueue succeeded:`, JSON.stringify(queueRes));
      
      // 3. Switch to queue
      console.log(`[Sonos Debug] Calling SwitchToQueue...`);
      await device.SwitchToQueue();
      console.log(`[Sonos Debug] SwitchToQueue succeeded.`);
      
      // 4. Play
      console.log(`[Sonos Debug] Calling Play...`);
      await device.Play();
      console.log(`[Sonos Debug] Play succeeded.`);
    } else {
      // Stream or individual track – pass trackObj as an object so the library's
      // SOAP serializer handles TrackToMetaData() + EncodeXml() correctly.
      const metadataObj = trackObj || '';
      console.log(`[Sonos Debug] Setting transport URI with metadata object...`);
      
      console.log(`[Sonos Debug] Calling SetAVTransportURI...`);
      const setUriRes = await device.AVTransportService.SetAVTransportURI({
        InstanceID: 0,
        CurrentURI: uri,
        CurrentURIMetaData: metadataObj
      });
      console.log(`[Sonos Debug] SetAVTransportURI succeeded:`, JSON.stringify(setUriRes));
      
      console.log(`[Sonos Debug] Calling Play...`);
      await device.Play();
      console.log(`[Sonos Debug] Play succeeded.`);
    }

    // Instant Loxone UDP notification
    const norm = normalizeRoomName(device.Name);
    if (deviceStates[norm]) deviceStates[norm].isPlaying = true;
    sendPlayStatus(device.Name, true);

    return fav.Title;
  } catch (err) {
    console.error(`[Sonos Debug] Error playing favorite "${favoriteName}" in room "${roomName}":`, formatError(err));
    throw err;
  }
}

/**
 * Performs Text-To-Speech.
 */
async function sayRoom(roomName, text, volumeVal) {
  console.log(`[Sonos Debug] sayRoom called for room "${roomName}", text: "${text}", volumeVal: "${volumeVal}"`);
  try {
    const device = getDevice(roomName);
    const settings = getSettings();

    // 1. Generate local MP3
    console.log(`[Sonos Debug] Generating TTS audio file...`);
    const filename = await generateTts(text, settings.ttsLanguage);
    console.log(`[Sonos Debug] Generated audio file: ${filename}`);

    // 2. Build local url
    const port = settings.port || 8888;
    const ip = settings.bridgeIp || getLocalIp();
    const ttsUrl = `http://${ip}:${port}/temp/tts/${filename}`;
    console.log(`[Sonos Debug] TTS URL: ${ttsUrl}`);

    // 3. Play as notification
    const vol = volumeVal ? parseInt(volumeVal, 10) : undefined;
    console.log(`[Sonos Debug] Playing TTS notification on "${device.Name}" with volume: ${vol}`);
    
    await device.PlayNotification({
      trackUri: ttsUrl,
      volume: vol,
      timeout: 20, // Revert after 20 seconds maximum if event is lost
      onlyWhenPlaying: false
    });
    console.log(`[Sonos Debug] TTS notification played successfully.`);

    return ttsUrl;
  } catch (err) {
    console.error(`[Sonos Debug] Error during sayRoom execution:`, formatError(err));
    throw err;
  }
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
    const state = deviceStates[norm] || { volume: -1, isPlaying: null, currentTrack: null, playMode: 'NORMAL', batteryLevel: null, isCharging: false };
    return {
      name: d.Name,
      ip: d.ip || d.host || 'LAN',
      volume: state.volume === -1 ? 0 : state.volume,
      isPlaying: !!state.isPlaying,
      currentTrack: state.currentTrack || null,
      playMode: state.playMode || 'NORMAL',
      diagnostics: d.diagnostics || null,
      batteryLevel: state.batteryLevel !== undefined ? state.batteryLevel : null,
      isCharging: !!state.isCharging
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
  nextTrack,
  previousTrack,
  setRoomPlayMode,
  getFavorites,
  playFavorite,
  sayRoom,
  getActiveRooms,
  getRoomStates,
  stopPolling,
  formatError,
  parseTrackInfo,
  fetchBatteryStatus,
  parseBatteryXml,
  updateDeviceBatteryStatus
};

