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
    if (themeIcon) themeIcon.textContent = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    if (themeIcon) themeIcon.textContent = '🌙';
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      if (themeIcon) themeIcon.textContent = isDark ? '☀️' : '🌙';
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
  let roomFavorites = {}; // Cached favorites: { roomName: [favorites] }
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

    const aliases = settings.roomAliases || {};
    document.getElementById('settings-aliases').value = JSON.stringify(aliases, null, 2);
  }

  // Fetch favorites for a specific Sonos room
  async function fetchFavorites(roomName) {
    try {
      const response = await fetch(`/api/favorites/${encodeURIComponent(roomName)}`);
      const data = await response.json();
      if (data.success) {
        roomFavorites[roomName] = data.favorites || [];
        updateFavoritesDropdown(roomName);
      }
    } catch (err) {
      console.warn(`Could not load favorites for room "${roomName}":`, err.message);
    }
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

    // Keep track of focused dropdowns to not disrupt user selection
    const focusedDropdowns = {};
    document.querySelectorAll('.favorites-dropdown').forEach(dropdown => {
      if (document.activeElement === dropdown) {
        const room = dropdown.getAttribute('data-room');
        focusedDropdowns[room] = dropdown.value;
      }
    });

    // We selectively update DOM elements to prevent flicker or slider reset during active dragging
    currentRooms.forEach(room => {
      const cardId = `speaker-card-${normalizeSelector(room.name)}`;
      let card = document.getElementById(cardId);

      // Check if volume slider is being dragged
      const dragging = isDraggingVolume[room.name];

      // Play/Pause icon/text
      const playIcon = room.isPlaying ? '⏸️' : '▶️';
      const playText = room.isPlaying ? 'Pause' : 'Play';
      
      // Volume icon selection
      let volIcon = '🔈';
      if (room.volume > 66) volIcon = '🔊';
      else if (room.volume > 33) volIcon = '🔉';
      else if (room.volume > 0) volIcon = '🔈';
      else volIcon = '🔇';

      if (!card) {
        // Create new card
        card = document.createElement('div');
        card.id = cardId;
        card.className = 'glass-card speaker-card';
        speakersGrid.appendChild(card);
      }

      // Update inner content, but preserve input values if user is interacting
      const favoritesOptions = buildFavoritesOptions(room.name, focusedDropdowns[room.name]);

      card.innerHTML = `
        <div class="speaker-card-header">
          <div class="speaker-info">
            <span class="speaker-room">${escapeHtml(room.name)}</span>
            <span class="speaker-ip">${escapeHtml(room.ip)}</span>
          </div>
          <button class="btn-play-pause-circle btn-play-pause ${room.isPlaying ? 'playing' : ''}" title="${playText}" data-room="${escapeHtml(room.name)}" data-playing="${room.isPlaying}">
            ${playIcon}
          </button>
        </div>
        <div class="speaker-volume-section">
          <div class="volume-labels">
            <span>Lautstärke</span>
            <span class="volume-val" id="volume-val-${normalizeSelector(room.name)}">${room.volume}%</span>
          </div>
          <div class="volume-slider-container">
            <span class="volume-icon" id="volume-icon-${normalizeSelector(room.name)}">${volIcon}</span>
            <input type="range" class="volume-slider" data-room="${escapeHtml(room.name)}" min="0" max="100" value="${dragging ? card.querySelector('.volume-slider').value : room.volume}" style="--value: ${dragging ? card.querySelector('.volume-slider').value : room.volume}%">
          </div>
        </div>
        <div class="speaker-card-footer">
          <div class="favorites-select-wrapper">
            <select class="favorites-dropdown" data-room="${escapeHtml(room.name)}">
              ${favoritesOptions}
            </select>
          </div>
          <button class="btn btn-secondary btn-tts-modal btn-tts-trigger" title="Sprachansage (TTS)" data-room="${escapeHtml(room.name)}">
            📢 Ansage
          </button>
        </div>
      `;
    });

    // Remove any card of a speaker that is no longer present
    const existingCards = speakersGrid.querySelectorAll('.speaker-card');
    existingCards.forEach(card => {
      const roomAttr = card.querySelector('.btn-play-pause').getAttribute('data-room');
      const stillExists = currentRooms.some(r => r.name === roomAttr);
      if (!stillExists) {
        card.remove();
      }
    });

    bindCardEvents();
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
      }
    } catch (err) {
      showToast('Netzwerkfehler', 'error');
    }
  }, 250);

  // Bind interactive event listeners to card controls
  function bindCardEvents() {
    // 1. Play / Pause Action
    document.querySelectorAll('.btn-play-pause').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        const room = btn.getAttribute('data-room');
        const isPlaying = btn.getAttribute('data-playing') === 'true';
        const action = isPlaying ? 'pause' : 'play';

        // Optimistic UI update
        btn.textContent = isPlaying ? '▶️' : '⏸️';
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
            fetchStatus();
          }
        } catch (err) {
          showToast('Netzwerkfehler', 'error');
          fetchStatus();
        }
      };
    });

    // 2. TTS Modal Opener
    document.querySelectorAll('.btn-tts-modal').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        activeTtsRoom = btn.getAttribute('data-room');
        modalRoomName.textContent = activeTtsRoom;
        ttsText.value = '';
        ttsModal.classList.add('active');
      };
    });

    // 3. Volume Sliders
    document.querySelectorAll('.volume-slider').forEach(slider => {
      const room = slider.getAttribute('data-room');
      const selector = normalizeSelector(room);
      const valText = document.getElementById(`volume-val-${selector}`);
      const volIcon = document.getElementById(`volume-icon-${selector}`);

      slider.onmousedown = slider.ontouchstart = () => {
        isDraggingVolume[room] = true;
      };

      slider.oninput = (e) => {
        const val = e.target.value;
        valText.textContent = `${val}%`;
        slider.style.setProperty('--value', val + '%');

        // Update speaker volume icon dynamically on drag
        let icon = '🔈';
        if (val > 66) icon = '🔊';
        else if (val > 33) icon = '🔉';
        else if (val > 0) icon = '🔈';
        else icon = '🔇';
        volIcon.textContent = icon;

        sendVolumeUpdate(room, val);
      };

      slider.onchange = () => {
        isDraggingVolume[room] = false;
        // Fetch status soon after drag release to align state
        setTimeout(fetchStatus, 500);
      };
    });

    // 4. Favorites Dropdown selection change
    document.querySelectorAll('.favorites-dropdown').forEach(dropdown => {
      dropdown.onchange = async (e) => {
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
          }
        } catch (err) {
          showToast('Netzwerkfehler', 'error');
        }
      };
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
      }
    } catch (err) {
      showToast('Netzwerkfehler beim Senden des TTS', 'error');
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

    // Validate and parse room aliases (JSON)
    const aliasesText = (formData.get('roomAliases') || '').trim();
    let roomAliases = {};

    if (aliasesText) {
      try {
        roomAliases = JSON.parse(aliasesText);
      } catch (err) {
        showToast('Ungültiges Format für Raum-Aliases. Muss ein gültiges JSON-Objekt sein.', 'error');
        return;
      }
    }

    const payload = {
      port,
      loxoneIp,
      loxonePort,
      ttsLanguage,
      staticSpeakerIps,
      roomAliases
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
      }
    } catch (err) {
      showToast('Netzwerkfehler beim Speichern der Einstellungen', 'error');
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
      }
    } catch (err) {
      showToast('Netzwerkfehler bei der Suche', 'error');
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

  // Initialize and start polling
  fetchStatus(true);
  pollInterval = setInterval(fetchStatus, 3000);
});
