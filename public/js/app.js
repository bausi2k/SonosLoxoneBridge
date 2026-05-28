/**
 * SonosLoxoneBridge - Frontend application logic
 * Features:
 * - Real-time volume slider updates with debounced API execution
 * - Play/Pause and TTS triggering
 * - Settings loading & submission with JSON validation for aliases
 * - Dynamic room rendering & XML export downloading
 * - Periodic background state polling
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const speakersGrid = document.getElementById('speakers-grid');
  const btnRefresh = document.getElementById('btn-refresh');
  const bridgeIpDisplay = document.getElementById('bridge-ip-display');
  const settingsForm = document.getElementById('settings-form');
  const toast = document.getElementById('notification-toast');

  // Tab Navigation Elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Theme Toggle Elements
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = themeToggle ? themeToggle.querySelector('.theme-icon') : null;

  // Initialize theme from localStorage
  const currentTheme = localStorage.getItem('theme') || 'light';
  if (currentTheme === 'dark') {
    document.body.classList.add('dark-mode');
    if (themeIcon) themeIcon.innerHTML = '<span class="material-symbols-outlined">light_mode</span>';
  } else {
    document.body.classList.remove('dark-mode');
    if (themeIcon) themeIcon.innerHTML = '<span class="material-symbols-outlined">dark_mode</span>';
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      if (themeIcon) themeIcon.innerHTML = isDark ? '<span class="material-symbols-outlined">light_mode</span>' : '<span class="material-symbols-outlined">dark_mode</span>';
    });
  }

  // TTS Modal Elements
  const ttsModal = document.getElementById('tts-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnSendTts = document.getElementById('btn-send-tts');
  const ttsText = document.getElementById('tts-text');
  const ttsVolume = document.getElementById('tts-volume');
  const ttsVolumeValue = document.getElementById('tts-volume-value');
  const modalRoomName = document.getElementById('modal-room-name');

  // Log Console Elements
  const logConsole = document.getElementById('log-console');
  const btnCopyLogs = document.getElementById('btn-copy-logs');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  let logPollInterval = null;
  let activeLogCategory = 'all';

  // Fetch bridge logs
  async function fetchLogs() {
    const settingsTab = document.getElementById('tab-settings');
    if (!settingsTab || settingsTab.classList.contains('hidden')) {
      return;
    }
    
    const daysSelect = document.getElementById('filter-log-days');
    const levelSelect = document.getElementById('filter-log-level');
    const days = daysSelect ? daysSelect.value : '1';
    const level = levelSelect ? levelSelect.value : 'all';
    
    const url = `/api/logs?category=${activeLogCategory}&days=${days}&level=${level}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.success && data.logs) {
        renderLogs(data.logs);
      }
    } catch (err) {
      console.error('[Bridge Log Error] Failed to fetch logs:', err);
    }
  }

  // Render logs in the console
  function renderLogs(logs) {
    if (!logConsole) return;
    
    let html = '';
    logs.forEach(log => {
      let levelClass = 'log-info';
      if (log.level === 'WARN') {
        levelClass = 'log-warn';
      } else if (log.level === 'ERROR') {
        levelClass = 'log-error';
      }
      
      const timeStr = new Date(log.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const catBadge = `<span class="log-badge badge-${log.category.toLowerCase()}">${log.category}</span>`;
      
      let detailsHtml = '';
      let hasDetailsClass = '';
      if (log.details) {
        hasDetailsClass = 'has-details';
        detailsHtml = `
          <div class="log-details-expanded" style="display: none; width: 100%; margin-top: 0.5rem; margin-bottom: 0.5rem;">
            <pre style="margin: 0; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #a1a1a6; font-size: 0.75rem; white-space: pre-wrap; font-family: monospace;">${escapeHtml(JSON.stringify(log.details, null, 2))}</pre>
          </div>
        `;
      }
      
      html += `
        <div class="log-item ${hasDetailsClass}" data-id="${log.id}" style="border-bottom: 1px solid rgba(255,255,255,0.04); padding: 0.35rem 0.5rem; transition: background 0.2s;">
          <div class="log-row-header ${levelClass}" style="display: flex; align-items: center; gap: 0.75rem; cursor: ${log.details ? 'pointer' : 'default'}; min-height: 24px;">
            <span class="log-time" style="color: #8a9ab0; font-family: monospace; font-size: 0.8rem; flex-shrink: 0; letter-spacing: 0.05em;">[${timeStr}]</span>
            ${catBadge}
            <span class="log-message-text" style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; font-family: monospace; font-weight: 500;">${escapeHtml(log.message)}</span>
            ${log.details ? '<span class="log-details-indicator material-symbols-outlined" style="font-size: 1.1rem; color: #8a9ab0; flex-shrink: 0; user-select: none;">unfold_more</span>' : ''}
          </div>
          ${detailsHtml}
        </div>
      `;
    });
    
    if (logs.length === 0) {
      html = '<div style="text-align: center; color: var(--text-muted); padding: 1rem;">Keine Log-Einträge gefunden</div>';
    }
    
    const isAtBottom = logConsole.scrollHeight - logConsole.clientHeight <= logConsole.scrollTop + 80;
    
    logConsole.innerHTML = html;
    
    // Add event listeners for details expansion
    logConsole.querySelectorAll('.log-item.has-details').forEach(item => {
      const header = item.querySelector('.log-row-header');
      const details = item.querySelector('.log-details-expanded');
      const indicator = item.querySelector('.log-details-indicator');
      
      header.addEventListener('click', (e) => {
        const isCollapsed = details.style.display === 'none';
        details.style.display = isCollapsed ? 'block' : 'none';
        if (indicator) {
          indicator.textContent = isCollapsed ? 'unfold_less' : 'unfold_more';
          indicator.style.color = isCollapsed ? 'var(--color-orange)' : '#8a9ab0';
        }
        item.style.background = isCollapsed ? 'rgba(255,255,255,0.02)' : 'transparent';
      });
      
      // Simple hover effect for clickable rows
      header.addEventListener('mouseenter', () => {
        if (details.style.display === 'none') {
          item.style.background = 'rgba(255,255,255,0.02)';
        }
      });
      header.addEventListener('mouseleave', () => {
        if (details.style.display === 'none') {
          item.style.background = 'transparent';
        }
      });
    });
    
    if (isAtBottom || logConsole.scrollTop === 0) {
      logConsole.scrollTop = logConsole.scrollHeight;
    }
  }

  // Copy logs to clipboard
  if (btnCopyLogs) {
    btnCopyLogs.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!logConsole) return;
      
      const textToCopy = logConsole.textContent;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textToCopy);
        } else {
          // Fallback for non-secure HTTP contexts (e.g. running on local IP)
          const textArea = document.createElement('textarea');
          textArea.value = textToCopy;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          if (!successful) {
            throw new Error('execCommand copy failed');
          }
        }
        showToast('System-Protokoll in Zwischenablage kopiert');
      } catch (err) {
        showToast('Kopieren fehlgeschlagen', 'error');
        console.error('[Bridge Log Copy Error] Clipboard write failed:', err);
      }
    });
  }

  // Clear logs in backend and frontend
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm('Möchten Sie das System-Protokoll wirklich leeren?')) {
        return;
      }
      try {
        const response = await fetch('/api/logs/clear', {
          method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
          if (logConsole) logConsole.innerHTML = '';
          showToast('System-Protokoll gelöscht');
        } else {
          showToast('Leeren fehlgeschlagen', 'error');
        }
      } catch (err) {
        showToast('Netzwerkfehler beim Leeren der Logs', 'error');
        console.error('[Bridge Log Clear Error] API clear request failed:', err);
      }
    });
  }

  // Tab Switching Functionality
  function switchTab(tabId) {
    tabButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    tabContents.forEach(content => {
      if (content.id === `tab-${tabId}`) {
        content.classList.remove('hidden');
        content.classList.add('active');
      } else {
        content.classList.add('hidden');
        content.classList.remove('active');
      }
    });

    localStorage.setItem('activeTab', tabId);

    // Manage log polling interval dynamically based on active tab
    if (tabId === 'settings') {
      fetchLogs();
      if (!logPollInterval) {
        logPollInterval = setInterval(fetchLogs, 3000);
      }
    } else {
      if (logPollInterval) {
        clearInterval(logPollInterval);
        logPollInterval = null;
      }
    }

    if (tabId === 'presets') {
      fetchPresets();
      populatePresetCreator();
    }
  }

  // Bind click handlers to tab buttons
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Restore active tab from localStorage
  const savedTab = localStorage.getItem('activeTab') || 'speakers';
  switchTab(savedTab);

  // App State
  let currentRooms = [];
  let currentAliases = {};
  let roomFavorites = {}; // Cached favorites: { roomName: [favorites] }
  const showIpRooms = {}; // Track which speaker IPs are displayed
  let activeTtsRoom = '';
  let pollInterval = null;
  const isDraggingVolume = {}; // Track which sliders are being dragged: { roomName: boolean }

  // Debounce helper for volume change api calls
  function debounce(fn, delay) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Toast notifications helper
  function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast active ${type}`;
    setTimeout(() => {
      toast.classList.remove('active');
    }, 4000);
  }

  // Fetch status (settings and current room info)
  async function fetchStatus(isInitial = false) {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      
      if (data.success) {
        bridgeIpDisplay.textContent = data.bridgeIp;
        currentRooms = data.rooms;

        const versionDisplay = document.getElementById('version-display');
        if (versionDisplay && data.version) {
          versionDisplay.textContent = `v${data.version}`;
        }

        if (isInitial && data.settings) {
          populateSettingsForm(data.settings);
        }

        // Update manual IP and Port values dynamically
        const bridgePort = (data.settings && data.settings.port) || 8888;
        const bridgeIp = data.bridgeIp || '127.0.0.1';

        const manualIpEl = document.getElementById('manual-bridge-ip');
        const manualPortEl = document.getElementById('manual-bridge-port');
        if (manualIpEl) manualIpEl.textContent = bridgeIp;
        if (manualPortEl) manualPortEl.textContent = bridgePort;

        document.querySelectorAll('.ex-ip').forEach(el => {
          el.textContent = bridgeIp;
        });
        document.querySelectorAll('.ex-port').forEach(el => {
          el.textContent = bridgePort;
        });

        renderSpeakers();
        updateAliasSpeakerDropdown();
        updateManualSpeakerDropdown();
        
        // Fetch favorites for any newly discovered rooms
        currentRooms.forEach(room => {
          if (!roomFavorites[room.name]) {
            fetchFavorites(room.name);
          }
        });
      } else {
        console.error('Failed to retrieve bridge status:', data.error);
      }
    } catch (err) {
      console.error('Network error while polling status:', err);
    }
  }

  // Populate settings form with existing configuration
  function populateSettingsForm(settings) {
    document.getElementById('settings-port').value = settings.port || 8888;
    document.getElementById('settings-loxone-ip').value = settings.loxoneIp || '';
    document.getElementById('settings-loxone-port').value = settings.loxonePort || 7777;
    document.getElementById('settings-tts-language').value = settings.ttsLanguage || 'de';

    const staticIps = settings.staticSpeakerIps || [];
    document.getElementById('settings-static-ips').value = staticIps.join('\n');

    const dbLogsCheckbox = document.getElementById('settings-db-logs');
    if (dbLogsCheckbox) {
      dbLogsCheckbox.checked = settings.enableDatabaseLogs === true;
    }

    const dbStatus = document.getElementById('log-db-status');
    if (dbStatus) {
      dbStatus.textContent = settings.enableDatabaseLogs ? 'SQLite Aktiv' : 'RAM (Temporär)';
      dbStatus.style.borderColor = settings.enableDatabaseLogs ? 'var(--color-orange)' : 'var(--border-color)';
    }

    currentAliases = settings.roomAliases || {};
    renderAliasList();
  }

  // Update dropdown with available speakers
  function updateAliasSpeakerDropdown() {
    const select = document.getElementById('alias-speaker-select');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Lautsprecher wählen --</option>';

    currentRooms.forEach(room => {
      const opt = document.createElement('option');
      opt.value = room.name;
      opt.textContent = room.name;
      select.appendChild(opt);
    });

    if (currentValue && currentRooms.some(r => r.name === currentValue)) {
      select.value = currentValue;
    }
  }

  // Update manual tab dropdown with available speakers
  function updateManualSpeakerDropdown() {
    const select = document.getElementById('manual-speaker-select');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="" style="background: #1a1a1a;">-- Bitte Lautsprecher auswählen --</option>';

    // Sort current rooms alphabetically
    const sortedRooms = [...currentRooms].sort((a, b) => a.name.localeCompare(b.name));

    sortedRooms.forEach(room => {
      const opt = document.createElement('option');
      opt.value = room.name;
      opt.textContent = room.name;
      opt.style.background = '#1a1a1a';
      select.appendChild(opt);
    });

    if (currentValue && sortedRooms.some(r => r.name === currentValue)) {
      select.value = currentValue;
    } else if (currentValue) {
      // Clear commands if previously selected speaker is no longer present
      const cmdContainer = document.getElementById('manual-speaker-commands');
      if (cmdContainer) {
        cmdContainer.innerHTML = '';
        cmdContainer.classList.add('hidden');
      }
    }
  }

  // Render alias list items
  function renderAliasList() {
    const listContainer = document.getElementById('alias-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const keys = Object.keys(currentAliases);
    if (keys.length === 0) {
      listContainer.innerHTML = '<div class="alias-item-speaker" style="padding: 0.5rem; text-align: center;">Keine Aliases eingerichtet</div>';
      return;
    }

    keys.forEach(alias => {
      const speaker = currentAliases[alias];
      const item = document.createElement('div');
      item.className = 'alias-item';

      item.innerHTML = `
        <div class="alias-item-text">
          <strong>${alias}</strong>
          <span class="alias-item-arrow">&rarr;</span>
          <span class="alias-item-speaker">${speaker}</span>
        </div>
        <button type="button" class="btn-delete-alias" data-alias="${alias}" title="Alias löschen">
          <span class="material-symbols-outlined" style="font-size: 1.1rem;">delete</span>
        </button>
      `;

      listContainer.appendChild(item);
    });
  }

  // Fetch favorites for a specific Sonos room
  async function fetchFavorites(roomName) {
    try {
      const response = await fetch(`/api/favorites/${encodeURIComponent(roomName)}`);
      const data = await response.json();
      if (data.success) {
        roomFavorites[roomName] = data.favorites || [];
        updateFavoritesDropdown(roomName);
        
        // Refresh manual commands list if the speaker is currently selected
        const manualSelect = document.getElementById('manual-speaker-select');
        if (manualSelect && manualSelect.value === roomName) {
          manualSelect.dispatchEvent(new Event('change'));
        }
      } else {
        console.error(`Could not load favorites for room "${roomName}":`, data);
      }
    } catch (err) {
      console.warn(`Could not load favorites for room "${roomName}":`, err);
    }
  }

  // Helper to format now playing track details
  function getTrackDetails(room) {
    let title = 'Inaktiv';
    let artist = '';
    
    if (room.isPlaying) {
      title = 'Wiedergabe aktiv';
    }
    
    if (room.currentTrack) {
      const track = room.currentTrack;
      if (track.streamContent) {
        title = track.streamContent;
        artist = 'Live Stream';
      } else if (track.title) {
        title = track.title;
        artist = track.artist || '';
      }
    }
    
    return { title, artist };
  }

  // Get formatted album art URL (handling local Sonos vs external URLs)
  function getAlbumArtUrl(room) {
    if (room.currentTrack) {
      let art = room.currentTrack.albumArt;
      
      // If we don't have art, look in favorites
      if (!art && roomFavorites[room.name]) {
        const title = (room.currentTrack.title || '').toLowerCase().trim();
        const streamContent = (room.currentTrack.streamContent || '').toLowerCase().trim();
        
        if (title || streamContent) {
          const matchedFav = roomFavorites[room.name].find(fav => {
            if (!fav.Title) return false;
            const favTitle = fav.Title.toLowerCase().trim();
            
            // Check direct exact matches first
            if (favTitle === title || favTitle === streamContent) {
              return true;
            }
            // Check substring matches
            if (title && (title.includes(favTitle) || favTitle.includes(title))) {
              return true;
            }
            if (streamContent && (streamContent.includes(favTitle) || favTitle.includes(streamContent))) {
              return true;
            }
            return false;
          });
          
          if (matchedFav && matchedFav.TrackMetadata && matchedFav.TrackMetadata.AlbumArtUri) {
            art = matchedFav.TrackMetadata.AlbumArtUri;
          }
        }
      }

      if (art) {
        if (art.startsWith('http://') || art.startsWith('https://')) {
          // Check if it is a Sonos absolute URL with port 1400
          if (art.includes(':1400/')) {
            try {
              const urlObj = new URL(art);
              const speakerIp = urlObj.hostname;
              const pathAndQuery = urlObj.pathname + urlObj.search;
              return `/api/art?ip=${encodeURIComponent(speakerIp)}&path=${encodeURIComponent(pathAndQuery)}`;
            } catch (e) {
              // Fallback
            }
          }
          return art;
        }
        if (art.startsWith('/')) {
          return `/api/art?ip=${encodeURIComponent(room.ip)}&path=${encodeURIComponent(art)}`;
        }
      }
    }
    return '';
  }

  // Get battery icon class name based on level and charging state
  function getBatteryIcon(level, isCharging) {
    if (isCharging) {
      return 'battery_charging_full';
    }
    if (level === null || level === undefined) {
      return 'battery_unknown';
    }
    if (level <= 10) return 'battery_alert';
    if (level <= 20) return 'battery_1_bar';
    if (level <= 40) return 'battery_2_bar';
    if (level <= 60) return 'battery_3_bar';
    if (level <= 80) return 'battery_4_bar';
    if (level <= 95) return 'battery_5_bar';
    return 'battery_full';
  }

  // Render speakers in grid
  function renderSpeakers() {
    if (currentRooms.length === 0) {
      speakersGrid.innerHTML = `
        <div class="loading-state">
          <p>⚠️ Keine Sonos-Lautsprecher gefunden.</p>
          <small class="help-text">Überprüfen Sie Ihre Netzwerkkonfiguration oder fügen Sie statische IPs hinzu.</small>
        </div>
      `;
      return;
    }

    // Remove loading spinner if present
    const loadingState = speakersGrid.querySelector('.loading-state');
    if (loadingState) {
      loadingState.remove();
    }

    // We selectively update DOM elements to prevent flicker, dropdown closing, or slider reset during active interaction
    currentRooms.forEach(room => {
      const cardId = `speaker-card-${normalizeSelector(room.name)}`;
      let card = document.getElementById(cardId);

      // Check if volume slider is being dragged
      const dragging = isDraggingVolume[room.name];

      // Play/Pause icon/text
      const playIcon = room.isPlaying ? 'pause' : 'play_arrow';
      const playText = room.isPlaying ? 'Pause' : 'Abspielen';
      
      // Volume icon selection
      let volIcon = 'volume_mute';
      if (room.volume > 66) volIcon = 'volume_up';
      else if (room.volume > 33) volIcon = 'volume_down';
      else if (room.volume > 0) volIcon = 'volume_mute';
      else volIcon = 'volume_off';

      const favoritesOptions = buildFavoritesOptions(room.name);
      
      const ipVisible = !!showIpRooms[room.name];
      const trackDetails = getTrackDetails(room);
      const artUrl = getAlbumArtUrl(room);
      const resolvedArtUrl = artUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23888888" opacity="0.15"/><text x="50%" y="55%" font-size="60" text-anchor="middle">🎵</text></svg>';

      // PlayMode evaluation
      const pm = room.playMode || 'NORMAL';
      const shuffleActive = pm.startsWith('SHUFFLE');
      const repeatMode = pm === 'REPEAT_ONE' ? 'one' : (pm === 'REPEAT_ALL' || pm === 'SHUFFLE' ? 'all' : 'none');
      const repeatIcon = repeatMode === 'one' ? 'repeat_one' : 'repeat';

      if (!card) {
        // Create new card
        card = document.createElement('div');
        card.id = cardId;
        card.className = 'glass-card speaker-card';
        card.innerHTML = `
          <div class="speaker-card-header">
            <div class="speaker-title-area">
              <span class="speaker-room">${escapeHtml(room.name)}</span>
              <button class="btn-info-toggle" data-room="${escapeHtml(room.name)}" title="Details anzeigen">
                <span class="material-symbols-outlined">info</span>
              </button>
              ${room.batteryLevel !== null ? `
                <div class="battery-badge ${room.isCharging ? 'charging' : ''} ${room.batteryLevel <= 20 ? 'low' : ''}" title="${room.isCharging ? 'Wird geladen' : 'Batteriebetrieb'}: ${room.batteryLevel}%">
                  <span class="material-symbols-outlined">${getBatteryIcon(room.batteryLevel, room.isCharging)}</span>
                  <span>${room.batteryLevel}%</span>
                </div>
              ` : ''}
            </div>
            <div class="speaker-ip-badge ${ipVisible ? 'visible' : ''}" data-ip="${escapeHtml(room.ip)}" data-diag-loaded="${!!room.diagnostics}">
              <div class="info-row"><strong>IP-Adresse:</strong> <span>${escapeHtml(room.ip)}</span></div>
              ${room.diagnostics ? `
                <div class="info-row"><strong>Modell:</strong> <span>${escapeHtml(room.diagnostics.modelName || 'Sonos-Lautsprecher')}</span></div>
                <div class="info-row"><strong>Seriennummer:</strong> <span>${escapeHtml(room.diagnostics.serialNumber || '-')}</span></div>
                <div class="info-row"><strong>Firmware:</strong> <span>${escapeHtml(room.diagnostics.displayVersion || room.diagnostics.softwareVersion || '-')}</span></div>
                <div class="info-row"><strong>MAC-Adresse:</strong> <span>${escapeHtml(room.diagnostics.macAddress || '-')}</span></div>
              ` : ''}
            </div>
          </div>
          
          <div class="artwork-section">
            <div class="artwork-container">
              <img class="speaker-artwork" src="${escapeHtml(resolvedArtUrl)}" alt="Album Art" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22 viewBox=%220 0 200 200%22><rect width=%22200%22 height=%22200%22 fill=%22%23888888%22 opacity=%220.15%22/><text x=%2250%%22 y=%2255%%22 font-size=%2260%22 text-anchor=%22middle%22>🎵</text></svg>'">
            </div>
          </div>

          <div class="track-info-section">
            <div class="track-title">${escapeHtml(trackDetails.title)}</div>
            <div class="track-artist">${escapeHtml(trackDetails.artist)}</div>
          </div>

          <div class="media-controls-section">
            <button class="control-btn btn-shuffle ${shuffleActive ? 'active' : ''}" data-room="${escapeHtml(room.name)}" data-playmode="${pm}" title="Zufallswiedergabe">
              <span class="material-symbols-outlined">shuffle</span>
            </button>
            <button class="control-btn btn-prev" data-room="${escapeHtml(room.name)}" title="Vorheriger Titel">
              <span class="material-symbols-outlined">skip_previous</span>
            </button>
            <button class="control-btn btn-play-pause-circle btn-play-pause ${room.isPlaying ? 'playing' : ''}" data-room="${escapeHtml(room.name)}" data-playing="${room.isPlaying}" title="${playText}">
              <span class="material-symbols-outlined">${playIcon}</span>
            </button>
            <button class="control-btn btn-next" data-room="${escapeHtml(room.name)}" title="Nächster Titel">
              <span class="material-symbols-outlined">skip_next</span>
            </button>
            <button class="control-btn btn-repeat ${repeatMode !== 'none' ? 'active' : ''}" data-room="${escapeHtml(room.name)}" data-playmode="${pm}" title="Wiederholung">
              <span class="material-symbols-outlined">${repeatIcon}</span>
            </button>
          </div>

          <div class="speaker-volume-section">
            <div class="volume-labels">
              <span>Lautstärke</span>
              <span class="volume-val" id="volume-val-${normalizeSelector(room.name)}">${room.volume}%</span>
            </div>
            <div class="volume-slider-container">
              <span class="volume-icon" id="volume-icon-${normalizeSelector(room.name)}"><span class="material-symbols-outlined">${volIcon}</span></span>
              <button type="button" class="btn-vol-adjust btn-vol-down" data-room="${escapeHtml(room.name)}" title="Leiser (-2%)">
                <span class="material-symbols-outlined">remove</span>
              </button>
              <input type="range" class="volume-slider" data-room="${escapeHtml(room.name)}" min="0" max="100" value="${room.volume}" style="--value: ${room.volume}%">
              <button type="button" class="btn-vol-adjust btn-vol-up" data-room="${escapeHtml(room.name)}" title="Lauter (+2%)">
                <span class="material-symbols-outlined">add</span>
              </button>
            </div>
          </div>

          <div class="speaker-card-footer">
            <div class="favorites-select-wrapper">
              <select class="favorites-dropdown" data-room="${escapeHtml(room.name)}">
                ${favoritesOptions}
              </select>
            </div>
            <button class="btn btn-secondary btn-tts-modal btn-tts-trigger" title="Sprachansage (TTS)" data-room="${escapeHtml(room.name)}">
              <span class="material-symbols-outlined btn-icon-symbol">record_voice_over</span> Ansage
            </button>
          </div>
        `;
        speakersGrid.appendChild(card);
      } else {
        // Update existing card dynamically
        const titleArea = card.querySelector('.speaker-title-area');
        if (titleArea) {
          let badge = titleArea.querySelector('.battery-badge');
          if (room.batteryLevel !== null) {
            const iconName = getBatteryIcon(room.batteryLevel, room.isCharging);
            const titleStr = `${room.isCharging ? 'Wird geladen' : 'Batteriebetrieb'}: ${room.batteryLevel}%`;
            
            if (!badge) {
              badge = document.createElement('div');
              titleArea.appendChild(badge);
            }
            badge.className = `battery-badge ${room.isCharging ? 'charging' : ''} ${room.batteryLevel <= 20 ? 'low' : ''}`;
            badge.title = titleStr;
            badge.innerHTML = `
              <span class="material-symbols-outlined">${iconName}</span>
              <span>${room.batteryLevel}%</span>
            `;
          } else if (badge) {
            badge.remove();
          }
        }

        const playBtn = card.querySelector('.btn-play-pause');
        if (playBtn) {
          playBtn.className = `control-btn btn-play-pause-circle btn-play-pause ${room.isPlaying ? 'playing' : ''}`;
          playBtn.title = playText;
          playBtn.setAttribute('data-playing', room.isPlaying.toString());
          playBtn.innerHTML = `<span class="material-symbols-outlined">${playIcon}</span>`;
        }

        const ipBadge = card.querySelector('.speaker-ip-badge');
        if (ipBadge) {
          ipBadge.className = `speaker-ip-badge ${ipVisible ? 'visible' : ''}`;
          
          let badgeContent = `<div class="info-row"><strong>IP-Adresse:</strong> <span>${escapeHtml(room.ip)}</span></div>`;
          if (room.diagnostics) {
            badgeContent += `
              <div class="info-row"><strong>Modell:</strong> <span>${escapeHtml(room.diagnostics.modelName || 'Sonos-Lautsprecher')}</span></div>
              <div class="info-row"><strong>Seriennummer:</strong> <span>${escapeHtml(room.diagnostics.serialNumber || '-')}</span></div>
              <div class="info-row"><strong>Firmware:</strong> <span>${escapeHtml(room.diagnostics.displayVersion || room.diagnostics.softwareVersion || '-')}</span></div>
              <div class="info-row"><strong>MAC-Adresse:</strong> <span>${escapeHtml(room.diagnostics.macAddress || '-')}</span></div>
            `;
          }
          if (ipBadge.getAttribute('data-diag-loaded') !== (!!room.diagnostics).toString() || ipBadge.getAttribute('data-ip') !== room.ip) {
            ipBadge.innerHTML = badgeContent;
            ipBadge.setAttribute('data-diag-loaded', (!!room.diagnostics).toString());
            ipBadge.setAttribute('data-ip', room.ip);
          }
        }

        const artwork = card.querySelector('.speaker-artwork');
        if (artwork && artwork.src !== resolvedArtUrl) {
          artwork.src = resolvedArtUrl;
        }

        const titleEl = card.querySelector('.track-title');
        if (titleEl && titleEl.textContent !== trackDetails.title) {
          titleEl.textContent = trackDetails.title;
        }

        const artistEl = card.querySelector('.track-artist');
        if (artistEl && artistEl.textContent !== trackDetails.artist) {
          artistEl.textContent = trackDetails.artist;
        }

        const shuffleBtn = card.querySelector('.btn-shuffle');
        if (shuffleBtn) {
          shuffleBtn.setAttribute('data-playmode', pm);
          shuffleBtn.className = `control-btn btn-shuffle ${shuffleActive ? 'active' : ''}`;
        }

        const repeatBtn = card.querySelector('.btn-repeat');
        if (repeatBtn) {
          repeatBtn.setAttribute('data-playmode', pm);
          repeatBtn.className = `control-btn btn-repeat ${repeatMode !== 'none' ? 'active' : ''}`;
          repeatBtn.innerHTML = `<span class="material-symbols-outlined">${repeatIcon}</span>`;
        }

        const valText = card.querySelector('.volume-val');
        if (valText) {
          valText.textContent = `${room.volume}%`;
        }

        const volIconEl = card.querySelector('.volume-icon');
        if (volIconEl) {
          volIconEl.innerHTML = `<span class="material-symbols-outlined">${volIcon}</span>`;
        }

        if (!dragging) {
          const slider = card.querySelector('.volume-slider');
          if (slider) {
            slider.value = room.volume;
            slider.style.setProperty('--value', room.volume + '%');
          }
        }
      }
    });

    // Remove any card of a speaker that is no longer present
    const existingCards = speakersGrid.querySelectorAll('.speaker-card');
    existingCards.forEach(card => {
      const playBtn = card.querySelector('.btn-play-pause');
      if (playBtn) {
        const roomAttr = playBtn.getAttribute('data-room');
        const stillExists = currentRooms.some(r => r.name === roomAttr);
        if (!stillExists) {
          card.remove();
        }
      }
    });
  }

  // Helper to build favorites option list
  function buildFavoritesOptions(roomName, selectedVal) {
    const list = roomFavorites[roomName] || [];
    let options = `<option value="">-- Favoriten --</option>`;
    list.forEach(fav => {
      const isSelected = selectedVal === fav.Title ? 'selected' : '';
      options += `<option value="${escapeHtml(fav.Title)}" ${isSelected}>${escapeHtml(fav.Title)}</option>`;
    });
    return options;
  }

  // Update dynamic dropdown element if updated in background
  function updateFavoritesDropdown(roomName) {
    const selector = `.favorites-dropdown[data-room="${CSS.escape(roomName)}"]`;
    const dropdown = document.querySelector(selector);
    if (dropdown && document.activeElement !== dropdown) {
      dropdown.innerHTML = buildFavoritesOptions(roomName);
    }
  }

  // Debounced API call for volume change
  const sendVolumeUpdate = debounce(async (room, volume) => {
    try {
      const response = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, action: 'volume', value: parseInt(volume, 10) })
      });
      const data = await response.json();
      if (!data.success) {
        showToast(data.error || 'Fehler beim Einstellen der Lautstärke', 'error');
        console.error('[Bridge Control Error] volume action failed:', data);
      }
    } catch (err) {
      showToast('Netzwerkfehler', 'error');
      console.error('[Bridge Network Error] volume action fetch failed:', err);
    }
  }, 250);

  // Set up event delegation once on load
  function setupEventDelegation() {
    // 1. Play / Pause Action
    speakersGrid.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-play-pause');
      if (!btn) return;
      e.preventDefault();
      
      const room = btn.getAttribute('data-room');
      const isPlaying = btn.getAttribute('data-playing') === 'true';
      const action = isPlaying ? 'pause' : 'play';

      // Optimistic UI update
      btn.innerHTML = `<span class="material-symbols-outlined">${isPlaying ? 'play_arrow' : 'pause'}</span>`;
      btn.className = `control-btn btn-play-pause-circle btn-play-pause ${!isPlaying ? 'playing' : ''}`;
      btn.setAttribute('data-playing', (!isPlaying).toString());

      try {
        const response = await fetch('/api/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room, action })
        });
        const data = await response.json();
        if (data.success) {
          showToast(isPlaying ? `Wiedergabe in ${room} pausiert` : `Wiedergabe in ${room} gestartet`);
          fetchStatus();
        } else {
          showToast(data.error || 'Aktion fehlgeschlagen', 'error');
          console.error('[Bridge Control Error] play/pause action failed:', data);
          fetchStatus();
        }
      } catch (err) {
        showToast('Netzwerkfehler', 'error');
        console.error('[Bridge Network Error] play/pause action fetch failed:', err);
        fetchStatus();
      }
    });

    // 2. Info IP Toggle
    speakersGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-info-toggle');
      if (!btn) return;
      e.preventDefault();
      const room = btn.getAttribute('data-room');
      showIpRooms[room] = !showIpRooms[room];
      
      // Toggle visibility in DOM immediately
      const selector = normalizeSelector(room);
      const badge = document.querySelector(`#speaker-card-${selector} .speaker-ip-badge`);
      if (badge) {
        badge.classList.toggle('visible', showIpRooms[room]);
      }
    });

    // 3. Previous Track Action
    speakersGrid.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-prev');
      if (!btn) return;
      e.preventDefault();
      const room = btn.getAttribute('data-room');
      try {
        const response = await fetch('/api/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room, action: 'previous' })
        });
        const data = await response.json();
        if (data.success) {
          showToast(`Vorheriger Titel in ${room}`);
          fetchStatus();
        } else {
          showToast(data.error || 'Aktion fehlgeschlagen', 'error');
        }
      } catch (err) {
        showToast('Netzwerkfehler', 'error');
      }
    });

    // 4. Next Track Action
    speakersGrid.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-next');
      if (!btn) return;
      e.preventDefault();
      const room = btn.getAttribute('data-room');
      try {
        const response = await fetch('/api/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room, action: 'next' })
        });
        const data = await response.json();
        if (data.success) {
          showToast(`Nächster Titel in ${room}`);
          fetchStatus();
        } else {
          showToast(data.error || 'Aktion fehlgeschlagen', 'error');
        }
      } catch (err) {
        showToast('Netzwerkfehler', 'error');
      }
    });

    // 5. Shuffle Toggle Action
    speakersGrid.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-shuffle');
      if (!btn) return;
      e.preventDefault();
      const room = btn.getAttribute('data-room');
      const playMode = btn.getAttribute('data-playmode') || 'NORMAL';
      
      const isShuffle = playMode.startsWith('SHUFFLE');
      const isRepeatAll = playMode === 'REPEAT_ALL' || playMode === 'SHUFFLE';
      
      let targetMode = 'NORMAL';
      if (!isShuffle) {
        targetMode = isRepeatAll ? 'SHUFFLE' : 'SHUFFLE_NOREPEAT';
      } else {
        targetMode = isRepeatAll ? 'REPEAT_ALL' : 'NORMAL';
      }
      
      try {
        const response = await fetch('/api/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room, action: 'playmode', value: targetMode })
        });
        const data = await response.json();
        if (data.success) {
          showToast(`Zufallswiedergabe in ${room} geändert`);
          fetchStatus();
        } else {
          showToast(data.error || 'Aktion fehlgeschlagen', 'error');
        }
      } catch (err) {
        showToast('Netzwerkfehler', 'error');
      }
    });

    // 6. Repeat Cycle Action
    speakersGrid.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-repeat');
      if (!btn) return;
      e.preventDefault();
      const room = btn.getAttribute('data-room');
      const playMode = btn.getAttribute('data-playmode') || 'NORMAL';
      
      const isShuffle = playMode.startsWith('SHUFFLE');
      let currentRepeat = 'none';
      if (playMode === 'REPEAT_ONE') currentRepeat = 'one';
      else if (playMode === 'REPEAT_ALL' || playMode === 'SHUFFLE') currentRepeat = 'all';
      
      let nextRepeat = 'none';
      if (currentRepeat === 'none') nextRepeat = 'all';
      else if (currentRepeat === 'all') nextRepeat = 'one';
      else if (currentRepeat === 'one') nextRepeat = 'none';
      
      let targetMode = 'NORMAL';
      if (nextRepeat === 'none') {
        targetMode = isShuffle ? 'SHUFFLE_NOREPEAT' : 'NORMAL';
      } else if (nextRepeat === 'all') {
        targetMode = isShuffle ? 'SHUFFLE' : 'REPEAT_ALL';
      } else if (nextRepeat === 'one') {
        targetMode = 'REPEAT_ONE';
      }
      
      try {
        const response = await fetch('/api/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room, action: 'playmode', value: targetMode })
        });
        const data = await response.json();
        if (data.success) {
          showToast(`Wiederholungsmodus in ${room} geändert`);
          fetchStatus();
        } else {
          showToast(data.error || 'Aktion fehlgeschlagen', 'error');
        }
      } catch (err) {
        showToast('Netzwerkfehler', 'error');
      }
    });

    // 7. TTS Modal Opener
    speakersGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-tts-trigger');
      if (!btn) return;
      e.preventDefault();
      activeTtsRoom = btn.getAttribute('data-room');
      modalRoomName.textContent = activeTtsRoom;
      ttsText.value = '';
      ttsModal.classList.add('active');
    });

    // 8. Volume Sliders Drag state
    const handleDragStart = (e) => {
      const slider = e.target.closest('.volume-slider');
      if (!slider) return;
      const room = slider.getAttribute('data-room');
      isDraggingVolume[room] = true;
    };
    speakersGrid.addEventListener('mousedown', handleDragStart);
    speakersGrid.addEventListener('touchstart', handleDragStart, { passive: true });

    // Slider Input (dragging)
    speakersGrid.addEventListener('input', (e) => {
      const slider = e.target.closest('.volume-slider');
      if (!slider) return;
      const room = slider.getAttribute('data-room');
      const val = e.target.value;
      
      const selector = normalizeSelector(room);
      const valText = document.getElementById(`volume-val-${selector}`);
      const volIcon = document.getElementById(`volume-icon-${selector}`);

      if (valText) valText.textContent = `${val}%`;
      slider.style.setProperty('--value', val + '%');

      // Update speaker volume icon dynamically on drag
      let icon = 'volume_mute';
      if (val > 66) icon = 'volume_up';
      else if (val > 33) icon = 'volume_down';
      else if (val > 0) icon = 'volume_mute';
      else icon = 'volume_off';
      if (volIcon) volIcon.innerHTML = `<span class="material-symbols-outlined">${icon}</span>`;

      sendVolumeUpdate(room, val);
    });

    // Slider Change (release)
    speakersGrid.addEventListener('change', (e) => {
      const slider = e.target.closest('.volume-slider');
      if (!slider) return;
      const room = slider.getAttribute('data-room');
      isDraggingVolume[room] = false;
      // Fetch status soon after drag release to align state
      setTimeout(fetchStatus, 500);
    });

    // Volume adjustments (+/- buttons)
    speakersGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-vol-adjust');
      if (!btn) return;
      e.preventDefault();
      
      const room = btn.getAttribute('data-room');
      const isUp = btn.classList.contains('btn-vol-up');
      const step = 2;
      const selector = normalizeSelector(room);
      
      const slider = document.querySelector(`.volume-slider[data-room="${CSS.escape(room)}"]`);
      if (slider) {
        let val = parseInt(slider.value, 10);
        val = isUp ? Math.min(100, val + step) : Math.max(0, val - step);
        slider.value = val;
        slider.style.setProperty('--value', val + '%');
        
        const valText = document.getElementById(`volume-val-${selector}`);
        const volIcon = document.getElementById(`volume-icon-${selector}`);
        if (valText) valText.textContent = `${val}%`;
        
        let icon = 'volume_mute';
        if (val > 66) icon = 'volume_up';
        else if (val > 33) icon = 'volume_down';
        else if (val > 0) icon = 'volume_mute';
        else icon = 'volume_off';
        if (volIcon) volIcon.innerHTML = `<span class="material-symbols-outlined">${icon}</span>`;
        
        sendVolumeUpdate(room, val);
      }
    });

    // 9. Favorites Dropdown selection change
    speakersGrid.addEventListener('change', async (e) => {
      const dropdown = e.target.closest('.favorites-dropdown');
      if (!dropdown) return;
      const room = dropdown.getAttribute('data-room');
      const favName = e.target.value;
      if (!favName) return;

      try {
        const response = await fetch('/api/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room, action: 'favorite', value: favName })
        });
        const data = await response.json();
        if (data.success) {
          showToast(`Favorit "${favName}" wird in ${room} abgespielt`);
          fetchStatus();
        } else {
          showToast(data.error || 'Aktion fehlgeschlagen', 'error');
          console.error('[Bridge Control Error] favorite action failed:', data);
        }
      } catch (err) {
        showToast('Netzwerkfehler', 'error');
        console.error('[Bridge Network Error] favorite action fetch failed:', err);
      }
    });
  }

  // ==========================================
  // TTS Modal Actions
  // ==========================================
  
  // Close TTS modal
  function closeModal() {
    ttsModal.classList.remove('active');
    activeTtsRoom = '';
  }

  btnCloseModal.onclick = closeModal;

  // Click outside modal content closes it
  ttsModal.onclick = (e) => {
    if (e.target === ttsModal) closeModal();
  };

  // Sync volume text with modal slider input
  ttsVolume.oninput = (e) => {
    ttsVolumeValue.textContent = `${e.target.value}%`;
  };

  // Trigger speech synthesis play event
  btnSendTts.onclick = async () => {
    const text = ttsText.value.trim();
    const volume = parseInt(ttsVolume.value, 10);

    if (!text) {
      showToast('Bitte geben Sie einen Ansagetext ein.', 'error');
      return;
    }

    try {
      const response = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: activeTtsRoom,
          action: 'say',
          value: { text, volume }
        })
      });
      const data = await response.json();
      if (data.success) {
        showToast('Sprachansage erfolgreich gesendet');
        closeModal();
      } else {
        showToast(data.error || 'Sprachansage fehlgeschlagen', 'error');
        console.error('[Bridge Control Error] say action failed:', data);
      }
    } catch (err) {
      showToast('Netzwerkfehler beim Senden des TTS', 'error');
      console.error('[Bridge Network Error] say action fetch failed:', err);
    }
  };

  // ==========================================
  // Settings Form Management
  // ==========================================

  settingsForm.onsubmit = async (e) => {
    e.preventDefault();

    const formData = new FormData(settingsForm);
    const port = parseInt(formData.get('port'), 10);
    const loxonePort = parseInt(formData.get('loxonePort'), 10);
    const loxoneIp = formData.get('loxoneIp').trim();
    const ttsLanguage = formData.get('ttsLanguage');

    // Parse static IPs: one per line
    const staticSpeakerIpsText = formData.get('staticSpeakerIps') || '';
    const staticSpeakerIps = staticSpeakerIpsText
      .split('\n')
      .map(ip => ip.trim())
      .filter(ip => ip.length > 0);

    const enableDatabaseLogs = document.getElementById('settings-db-logs').checked;

    const payload = {
      port,
      loxoneIp,
      loxonePort,
      ttsLanguage,
      staticSpeakerIps,
      roomAliases: currentAliases,
      enableDatabaseLogs
    };

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.success) {
        showToast('Einstellungen erfolgreich gespeichert');
        // Re-fetch status to capture any potential new state/discovery triggered by settings
        setTimeout(() => fetchStatus(true), 1000);
      } else {
        showToast(data.error || 'Speichern der Einstellungen fehlgeschlagen', 'error');
        console.error('[Bridge Settings Error] save settings failed:', data);
      }
    } catch (err) {
      showToast('Netzwerkfehler beim Speichern der Einstellungen', 'error');
      console.error('[Bridge Network Error] save settings fetch failed:', err);
    }
  };

  // Refresh manually (performs SSDP discovery)
  btnRefresh.onclick = async (e) => {
    e.preventDefault();
    
    // Disable button to prevent double-clicks
    btnRefresh.disabled = true;
    const originalContent = btnRefresh.innerHTML;
    btnRefresh.innerHTML = '<span class="btn-icon">🔄</span> Suche...';

    // Show loading state in the grid while searching
    speakersGrid.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Suche nach Sonos-Lautsprechern im Netzwerk...</p>
      </div>
    `;

    try {
      const response = await fetch('/api/discover', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        showToast('Suche beendet. Sonos-Lautsprecher aktualisiert.');
      } else {
        showToast('Fehler bei der Suche: ' + (data.error || 'Unbekannt'), 'error');
        console.error('[Bridge Discover Error] discovery failed:', data);
      }
    } catch (err) {
      showToast('Netzwerkfehler bei der Suche', 'error');
      console.error('[Bridge Network Error] discovery fetch failed:', err);
    } finally {
      btnRefresh.disabled = false;
      btnRefresh.innerHTML = originalContent;
      // Re-fetch status to update UI
      await fetchStatus();
    }
  };

  // Helper function to escape HTML special chars to prevent XSS
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Normalizes strings for usage in DOM selectors/IDs (removes spaces, special chars)
  function normalizeSelector(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // ==========================================================================
  // Presets Logic & UI Renderer
  // ==========================================================================

  const presetsListContainer = document.getElementById('presets-list');
  const presetForm = document.getElementById('preset-form');
  const presetCoordinatorSelect = document.getElementById('preset-coordinator');
  const presetCoordinatorVolumeInput = document.getElementById('preset-coordinator-volume');
  const presetMembersListContainer = document.getElementById('preset-members-list');
  const presetFavoriteSelect = document.getElementById('preset-favorite');

  // Fetch all saved presets and render
  async function fetchPresets() {
    if (!presetsListContainer) return;
    try {
      const response = await fetch('/api/presets');
      const data = await response.json();
      if (data.success && data.presets) {
        renderPresets(data.presets);
      } else {
        presetsListContainer.innerHTML = `<p class="help-text">Fehler beim Laden der Presets: ${data.error || 'Unbekannt'}</p>`;
      }
    } catch (err) {
      presetsListContainer.innerHTML = '<p class="help-text">Netzwerkfehler beim Laden der Presets.</p>';
      console.error('[Bridge Presets Error] Failed to fetch presets:', err);
    }
  }

  // Render presets list in HTML
  function renderPresets(presets) {
    if (!presetsListContainer) return;
    if (presets.length === 0) {
      presetsListContainer.innerHTML = '<p class="help-text" style="text-align: center; padding: 2rem 0;">Keine Presets erstellt. Erstelle dein erstes Preset rechts!</p>';
      return;
    }

    let html = '';
    presets.forEach(p => {
      const config = p.config;
      const coordinator = config.players[0] ? `${config.players[0].roomName} (${config.players[0].volume}%)` : '-';
      const members = config.players.slice(1).map(m => `${m.roomName} (${m.volume}%)`).join(', ') || 'Keine';
      const favoriteInfo = config.favorite ? `<br><strong>Favorit:</strong> ${escapeHtml(config.favorite)}` : '';
      const sleepInfo = config.sleep ? `<br><strong>Sleep-Timer:</strong> ${config.sleep} Min` : '';
      const shuffleInfo = (config.playMode && config.playMode.shuffle) ? ' (Zufallswiedergabe)' : '';

      html += `
        <div class="preset-card-item" data-preset="${escapeHtml(p.name)}">
          <div class="preset-info">
            <span class="preset-info-name">${escapeHtml(p.name)}</span>
            <span class="preset-info-details">
              <strong>Koordinator:</strong> ${escapeHtml(coordinator)}${shuffleInfo}<br>
              <strong>Mitglieder:</strong> ${escapeHtml(members)}
              ${favoriteInfo}
              ${sleepInfo}
            </span>
          </div>
          <div class="preset-card-actions">
            <button class="btn btn-secondary btn-apply-preset" data-preset="${escapeHtml(p.name)}" title="Preset anwenden">
              <span class="material-symbols-outlined">play_arrow</span>
            </button>
            <button class="btn btn-secondary btn-danger btn-delete-preset" data-preset="${escapeHtml(p.name)}" title="Preset löschen">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        </div>
      `;
    });
    presetsListContainer.innerHTML = html;

    // Bind action events
    presetsListContainer.querySelectorAll('.btn-apply-preset').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.preset;
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width: 14px; height: 14px; margin: 0;"></div>';
        try {
          const res = await fetch(`/preset/${name}`);
          const data = await res.json();
          if (data.success) {
            showToast(`Preset "${name}" erfolgreich angewendet!`);
            // Trigger quick refresh
            setTimeout(fetchStatus, 1500);
          } else {
            showToast(`Fehler beim Anwenden: ${data.error || 'Unbekannt'}`, 'error');
          }
        } catch (e) {
          showToast('Netzwerkfehler beim Anwenden', 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalContent;
        }
      });
    });

    presetsListContainer.querySelectorAll('.btn-delete-preset').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.preset;
        if (!confirm(`Möchten Sie das Preset "${name}" wirklich löschen?`)) return;
        try {
          const res = await fetch(`/api/presets/${name}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            showToast(`Preset "${name}" gelöscht`);
            fetchPresets();
          } else {
            showToast(`Fehler beim Löschen: ${data.error || 'Unbekannt'}`, 'error');
          }
        } catch (e) {
          showToast('Netzwerkfehler beim Löschen', 'error');
        }
      });
    });
  }

  // Populate creator dropdowns with available rooms
  async function populatePresetCreator() {
    if (!presetCoordinatorSelect) return;
    
    const currentCoord = presetCoordinatorSelect.value;
    
    // 1. Populate Coordinator select
    let coordHtml = '<option value="">-- Wähle einen Lautsprecher --</option>';
    currentRooms.forEach(room => {
      const selected = room.name === currentCoord ? 'selected' : '';
      coordHtml += `<option value="${escapeHtml(room.name)}" ${selected}>${escapeHtml(room.name)}</option>`;
    });
    presetCoordinatorSelect.innerHTML = coordHtml;

    // 2. Populate favorite dropdown if coordinator is selected
    if (presetCoordinatorSelect.value) {
      await loadFavoritesForPresetCreator(presetCoordinatorSelect.value);
    } else {
      presetFavoriteSelect.innerHTML = '<option value="">-- Keinen (Wiedergabe fortsetzen) --</option>';
      presetMembersListContainer.innerHTML = '<p class="help-text" style="margin: 0;">Bitte wähle zuerst einen Koordinator aus.</p>';
    }
  }

  // Load favorites for selected coordinator
  async function loadFavoritesForPresetCreator(roomName) {
    if (!presetFavoriteSelect) return;
    const currentFav = presetFavoriteSelect.value;

    try {
      let favs = roomFavorites[roomName];
      if (!favs) {
        const res = await fetch(`/api/favorites/${roomName}`);
        const data = await res.json();
        if (data.success && data.favorites) {
          favs = data.favorites.map(f => f.Title);
          roomFavorites[roomName] = favs;
        }
      }

      let favHtml = '<option value="">-- Keinen (Wiedergabe fortsetzen) --</option>';
      if (favs && favs.length > 0) {
        favs.forEach(title => {
          const selected = title === currentFav ? 'selected' : '';
          favHtml += `<option value="${escapeHtml(title)}" ${selected}>${escapeHtml(title)}</option>`;
        });
      }
      presetFavoriteSelect.innerHTML = favHtml;
    } catch (err) {
      presetFavoriteSelect.innerHTML = '<option value="">-- Fehler beim Laden der Favoriten --</option>';
    }
  }

  // Update member checkboxes when coordinator select changes
  function updatePresetMembers() {
    if (!presetMembersListContainer) return;
    const coordName = presetCoordinatorSelect.value;
    if (!coordName) {
      presetMembersListContainer.innerHTML = '<p class="help-text" style="margin: 0;">Bitte wähle zuerst einen Koordinator aus.</p>';
      return;
    }

    let html = '';
    currentRooms.forEach(room => {
      if (room.name === coordName) return; // Skip coordinator in member list
      const norm = normalizeSelector(room.name);
      html += `
        <div class="preset-member-item">
          <label class="preset-member-label" for="member-chk-${norm}">
            <input type="checkbox" id="member-chk-${norm}" data-room="${escapeHtml(room.name)}" style="width: auto;">
            <span>${escapeHtml(room.name)}</span>
          </label>
          <div class="preset-member-vol-control">
            <input type="range" class="preset-member-vol-slider" id="member-vol-${norm}" min="0" max="100" value="20" disabled>
            <span class="preset-member-vol-val" id="member-val-${norm}">20%</span>
          </div>
        </div>
      `;
    });

    presetMembersListContainer.innerHTML = html;

    // Attach checkbox toggles to enable/disable volume sliders
    presetMembersListContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', () => {
        const norm = normalizeSelector(chk.dataset.room);
        const slider = document.getElementById(`member-vol-${norm}`);
        if (slider) {
          slider.disabled = !chk.checked;
        }
      });
    });

    // Attach input listeners to volume sliders to update percentage labels
    presetMembersListContainer.querySelectorAll('.preset-member-vol-slider').forEach(slider => {
      slider.addEventListener('input', () => {
        const norm = slider.id.replace('member-vol-', '');
        const valEl = document.getElementById(`member-val-${norm}`);
        if (valEl) {
          valEl.textContent = `${slider.value}%`;
        }
      });
    });
  }

  // Handle coordinator selection changes
  if (presetCoordinatorSelect) {
    presetCoordinatorSelect.addEventListener('change', async () => {
      const coordName = presetCoordinatorSelect.value;
      if (coordName) {
        await loadFavoritesForPresetCreator(coordName);
      } else {
        presetFavoriteSelect.innerHTML = '<option value="">-- Keinen (Wiedergabe fortsetzen) --</option>';
      }
      updatePresetMembers();
    });
  }

  // Save preset on submit
  if (presetForm) {
    presetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('preset-name').value.trim();
      const coordName = presetCoordinatorSelect.value;
      const coordVol = parseInt(presetCoordinatorVolumeInput.value, 10);
      const favorite = presetFavoriteSelect.value || null;
      const sleep = parseInt(document.getElementById('preset-sleep').value, 10) || null;
      const shuffle = document.getElementById('preset-shuffle').checked;
      const pauseOthers = document.getElementById('preset-pause-others').checked;

      if (!name || !coordName) {
        showToast('Name und Koordinator werden benötigt', 'error');
        return;
      }

      // Collect coordinator player
      const players = [
        { roomName: coordName, volume: coordVol }
      ];

      // Collect member players
      presetMembersListContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        if (chk.checked) {
          const room = chk.dataset.room;
          const norm = normalizeSelector(room);
          const slider = document.getElementById(`member-vol-${norm}`);
          const vol = slider ? parseInt(slider.value, 10) : 20;
          players.push({
            roomName: room,
            volume: vol
          });
        }
      });

      const config = {
        players,
        favorite,
        playMode: {
          shuffle
        },
        pauseOthers,
        sleep
      };

      try {
        const response = await fetch('/api/presets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, config })
        });
        const data = await response.json();
        
        if (data.success) {
          showToast(`Preset "${data.name}" erfolgreich gespeichert!`);
          presetForm.reset();
          presetCoordinatorSelect.value = '';
          presetFavoriteSelect.innerHTML = '<option value="">-- Keinen (Wiedergabe fortsetzen) --</option>';
          updatePresetMembers();
          fetchPresets();
        } else {
          showToast(`Speichern fehlgeschlagen: ${data.error || 'Unbekannt'}`, 'error');
        }
      } catch (err) {
        showToast('Netzwerkfehler beim Speichern des Presets', 'error');
      }
    });
  }

  function setupAliasManager() {
    const speakerSelect = document.getElementById('alias-speaker-select');
    const nameInput = document.getElementById('alias-name-input');
    const btnAdd = document.getElementById('btn-add-alias');
    const validationMsg = document.getElementById('alias-validation-msg');
    const aliasList = document.getElementById('alias-list');
    
    if (!speakerSelect || !nameInput || !btnAdd || !aliasList) return;
    
    const aliasRegex = /^[a-zA-Z0-9_]+$/;
    
    function validateInput() {
      const val = nameInput.value.trim();
      if (val === '') {
        validationMsg.classList.remove('visible');
        nameInput.style.borderColor = '';
        return true;
      }
      if (!aliasRegex.test(val)) {
        validationMsg.classList.add('visible');
        nameInput.style.borderColor = 'var(--color-red)';
        return false;
      } else {
        validationMsg.classList.remove('visible');
        nameInput.style.borderColor = '';
        return true;
      }
    }
    
    nameInput.addEventListener('input', validateInput);
    
    btnAdd.addEventListener('click', (e) => {
      e.preventDefault();
      const speaker = speakerSelect.value;
      const alias = nameInput.value.trim();
      
      if (!speaker) {
        showToast('Bitte wähle einen Lautsprecher aus', 'error');
        return;
      }
      if (!alias) {
        showToast('Bitte gib einen Alias-Namen ein', 'error');
        return;
      }
      if (!validateInput()) {
        showToast('Ungültiges Format für Alias-Name', 'error');
        return;
      }
      
      currentAliases[alias] = speaker;
      
      speakerSelect.value = '';
      nameInput.value = '';
      validationMsg.classList.remove('visible');
      nameInput.style.borderColor = '';
      
      renderAliasList();
      showToast(`Alias "${alias}" hinzugefügt`);
    });
    
    aliasList.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-delete-alias');
      if (btn) {
        e.preventDefault();
        const alias = btn.dataset.alias;
        if (alias && currentAliases[alias]) {
          delete currentAliases[alias];
          renderAliasList();
          showToast(`Alias "${alias}" entfernt`);
        }
      }
    });
  }

  function setupLogFilters() {
    const container = document.querySelector('.log-category-tabs');
    const daysSelect = document.getElementById('filter-log-days');
    const levelSelect = document.getElementById('filter-log-level');
    
    if (container) {
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.log-tab-btn');
        if (!btn) return;
        e.preventDefault();
        
        container.querySelectorAll('.log-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        activeLogCategory = btn.getAttribute('data-category');
        fetchLogs();
      });
    }
    
    if (daysSelect) {
      daysSelect.addEventListener('change', () => fetchLogs());
    }
    if (levelSelect) {
      levelSelect.addEventListener('change', () => fetchLogs());
    }
  }

  // Helper to copy text to clipboard
  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (!successful) throw new Error('copy command failed');
      }
      return true;
    } catch (err) {
      console.error('[Manual Commands] Clipboard write failed:', err);
      return false;
    }
  }

  // Setup speaker-specific commands in Anleitung tab
  function setupManualSpeakerCommands() {
    const select = document.getElementById('manual-speaker-select');
    const container = document.getElementById('manual-speaker-commands');
    if (!select || !container) return;

    select.addEventListener('change', () => {
      const roomName = select.value;
      if (!roomName) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
      }

      // Get current bridge IP & Port
      const bridgeIp = document.getElementById('manual-bridge-ip')?.textContent || window.location.hostname;
      const bridgePort = document.getElementById('manual-bridge-port')?.textContent || window.location.port;
      const baseUrl = `http://${bridgeIp}${bridgePort ? ':' + bridgePort : ''}`;
      const normRoom = encodeURIComponent(roomName);

      // Define default commands
      const commands = [
        {
          method: 'GET',
          path: `/${normRoom}/play`,
          desc: 'Startet die Musikwiedergabe in diesem Raum.'
        },
        {
          method: 'GET',
          path: `/${normRoom}/pause`,
          desc: 'Pausiert die Musikwiedergabe in diesem Raum.'
        },
        {
          method: 'GET',
          path: `/${normRoom}/volume/25`,
          desc: 'Setzt die Lautstärke absolut auf einen Prozentwert (z. B. 25%).'
        },
        {
          method: 'GET',
          path: `/${normRoom}/volume/+5`,
          desc: 'Erhöht die Lautstärke relativ um einen Wert (z. B. +5%).'
        },
        {
          method: 'GET',
          path: `/${normRoom}/volume/-10`,
          desc: 'Verringert die Lautstärke relativ um einen Wert (z. B. -10%).'
        },
        {
          method: 'GET',
          path: `/${normRoom}/say/${encodeURIComponent('Die Waschmaschine ist fertig')}/40`,
          desc: 'Führt eine Sprachansage (TTS) mit optionaler Lautstärke (z. B. 40%) aus.'
        },
        {
          method: 'GET',
          path: `/${normRoom}/tunein/play/68225`,
          desc: 'Spielt einen TuneIn-Radiosender über seine Stations-ID ab (z. B. 68225).'
        },
        {
          method: 'GET',
          path: `/${normRoom}/leave`,
          desc: 'Trennt den Lautsprecher aus einer Gruppe, so dass er wieder eigenständig läuft.'
        },
        {
          method: 'GET',
          path: `/${normRoom}/clip/bell.mp3/50`,
          desc: 'Spielt eine Sounddatei (z. B. bell.mp3) mit optionaler Lautstärke (z. B. 50%) ab.'
        }
      ];

      // Add favorites if available
      const favs = roomFavorites[roomName] || [];
      favs.forEach(fav => {
        commands.push({
          method: 'GET',
          path: `/${normRoom}/favorite/${encodeURIComponent(fav.title)}`,
          desc: `Spielt den Sonos-Favoriten "${fav.title}" ab.`
        });
      });

      // Render cards
      container.innerHTML = '';
      commands.forEach((cmd) => {
        const fullUrl = `${baseUrl}${cmd.path}`;
        const card = document.createElement('div');
        card.className = 'api-endpoint-card';
        card.innerHTML = `
          <div class="endpoint-header" style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div>
              <span class="method">${cmd.method}</span>
              <span class="path" style="word-break: break-all;">${cmd.path}</span>
            </div>
            <button class="btn-copy-cmd" data-url="${fullUrl}" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); color: var(--text-muted); cursor: pointer; border-radius: 6px; padding: 5px 10px; font-size: 0.8rem; font-weight: bold; display: flex; align-items: center; gap: 4px; transition: all 0.2s ease; white-space: nowrap;">
              <span class="material-symbols-outlined" style="font-size: 1rem;">content_copy</span> Kopieren
            </button>
          </div>
          <p class="endpoint-desc">${cmd.desc}</p>
          <div class="endpoint-example" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; background: rgba(0, 0, 0, 0.2); border-radius: 6px; padding: 8px 12px; margin-top: 8px;">
            <a href="${fullUrl}" target="_blank" class="endpoint-link" style="color: var(--color-blue); text-decoration: none; word-break: break-all; font-family: monospace; font-size: 0.95rem; flex-grow: 1; transition: color 0.2s ease;">${fullUrl}</a>
            <span class="material-symbols-outlined" style="font-size: 1.1rem; color: var(--text-muted);">open_in_new</span>
          </div>
        `;
        container.appendChild(card);
      });

      container.classList.remove('hidden');
    });

    // Add copy listener via event delegation
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-copy-cmd');
      if (btn) {
        e.preventDefault();
        const url = btn.dataset.url;
        const success = await copyTextToClipboard(url);
        if (success) {
          const originalText = btn.innerHTML;
          btn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1rem; color: var(--color-green);">check</span> Kopiert!`;
          btn.style.borderColor = 'var(--color-green)';
          btn.style.color = 'var(--color-green)';
          setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.borderColor = '';
            btn.style.color = '';
          }, 2000);
        }
      }
    });
  }

  // Initialize and start polling
  setupAliasManager();
  setupLogFilters();
  setupManualSpeakerCommands();
  setupEventDelegation();
  fetchStatus(true);
  pollInterval = setInterval(fetchStatus, 3000);
});
