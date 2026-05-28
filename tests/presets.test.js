const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { getSettings, saveSettings } = require('../src/settings');
const { 
  getDevice, 
  initializeSonos,
  playTuneIn,
  leaveGroup,
  playClip,
  sayAll,
  clipAll,
  applyPreset,
  stopPolling
} = require('../src/sonos');

// Mock @svrooij/sonos
jest.mock('@svrooij/sonos', () => {
  const actual = jest.requireActual('@svrooij/sonos');
  return {
    SonosDevice: jest.fn(),
    SonosManager: jest.fn(),
    MetaDataHelper: actual.MetaDataHelper
  };
});

// Mock Loxone triggers
jest.mock('../src/loxone', () => ({
  normalizeRoomName: jest.requireActual('../src/loxone').normalizeRoomName,
  sendPlayStatus: jest.fn(),
  sendVolumeStatus: jest.fn(),
  generateLoxoneXml: jest.fn().mockReturnValue('<xml></xml>')
}));

// Mock TTS
jest.mock('../src/tts', () => ({
  generateTts: jest.fn().mockResolvedValue('tts-file.mp3')
}));

describe('Presets & Loxone Inbound Commands', () => {
  let mockDevice;

  beforeEach(async () => {
    jest.clearAllMocks();

    saveSettings({
      port: 8888,
      loxoneIp: '192.168.1.10',
      loxonePort: 7777,
      ttsLanguage: 'de',
      staticSpeakerIps: ['192.168.1.50'],
      roomAliases: {}
    });

    mockDevice = {
      Name: 'Küche',
      ip: '192.168.1.50',
      LoadDeviceData: jest.fn().mockResolvedValue(true),
      Play: jest.fn().mockResolvedValue(true),
      Pause: jest.fn().mockResolvedValue(true),
      SetVolume: jest.fn().mockResolvedValue(true),
      PlayNotification: jest.fn().mockResolvedValue(true),
      JoinGroup: jest.fn().mockResolvedValue(true),
      SwitchToQueue: jest.fn().mockResolvedValue(true),
      ContentDirectoryService: {
        Browse: jest.fn().mockResolvedValue({
          Result: `&lt;DIDL-Lite&gt;&lt;item id=&quot;FV:2/1&quot;&gt;&lt;dc:title&gt;bak&lt;/dc:title&gt;&lt;res protocolInfo=&quot;x-rincon-cpcontainer:*:*:*&quot;&gt;x-rincon-cpcontainer:spotify&lt;/res&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;`
        })
      },
      AVTransportService: {
        BecomeCoordinatorOfStandaloneGroup: jest.fn().mockResolvedValue(true),
        SetAVTransportURI: jest.fn().mockResolvedValue(true),
        GetTransportInfo: jest.fn().mockResolvedValue({ CurrentTransportState: 'PLAYING' }),
        GetPositionInfo: jest.fn().mockResolvedValue({
          Track: 1,
          TrackDuration: '0:03:00',
          TrackMetaData: '',
          RelTime: '0:00:15'
        }),
        RemoveAllTracksFromQueue: jest.fn().mockResolvedValue(true),
        AddURIToQueue: jest.fn().mockResolvedValue(true),
        SetPlayMode: jest.fn().mockResolvedValue(true)
      },
      RenderingControlService: {
        GetVolume: jest.fn().mockResolvedValue(25)
      }
    };

    const { SonosDevice } = require('@svrooij/sonos');
    SonosDevice.mockImplementation(() => mockDevice);

    await initializeSonos();
  });

  afterEach(() => {
    stopPolling();
  });

  describe('Sonos Device Controls', () => {
    test('playTuneIn should call SetAVTransportURI and Play', async () => {
      const result = await playTuneIn('Küche', '68225');
      expect(result).toBe('68225');
      expect(mockDevice.AVTransportService.SetAVTransportURI).toHaveBeenCalledWith(
        expect.objectContaining({
          CurrentURI: expect.stringContaining('68225')
        })
      );
      expect(mockDevice.Play).toHaveBeenCalled();
    });

    test('leaveGroup should call BecomeCoordinatorOfStandaloneGroup', async () => {
      const result = await leaveGroup('Küche');
      expect(result).toBe(true);
      expect(mockDevice.AVTransportService.BecomeCoordinatorOfStandaloneGroup).toHaveBeenCalled();
    });

    test('playClip should trigger PlayNotification with full local URL', async () => {
      const url = await playClip('Küche', 'alarm.mp3', 45);
      expect(url).toContain('/clips/alarm.mp3');
      expect(mockDevice.PlayNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          trackUri: expect.stringContaining('/clips/alarm.mp3'),
          volume: 45
        })
      );
    });

    test('applyPreset should group members, set volumes and play favorite', async () => {
      const presetConfig = {
        players: [
          { roomName: 'Küche', volume: 15 },
          { roomName: 'Living Room', volume: 20 }
        ],
        favorite: 'bak',
        playMode: { shuffle: true },
        pauseOthers: false,
        sleep: 10
      };

      // Mock another device (Living Room)
      const mockLiving = {
        ...mockDevice,
        Name: 'Living Room',
        ip: '192.168.1.51'
      };

      const { SonosDevice } = require('@svrooij/sonos');
      SonosDevice.mockImplementation((ip) => {
        if (ip === '192.168.1.50') return mockDevice;
        return mockLiving;
      });

      // Update settings to include both IPs so auto-init loads both
      saveSettings({
        port: 8888,
        loxoneIp: '192.168.1.10',
        loxonePort: 7777,
        ttsLanguage: 'de',
        staticSpeakerIps: ['192.168.1.50', '192.168.1.51'],
        roomAliases: {}
      });

      await initializeSonos();

      const success = await applyPreset(presetConfig);
      expect(success).toBe(true);

      // Verify that coordinator leaves group to stand alone
      expect(mockDevice.AVTransportService.BecomeCoordinatorOfStandaloneGroup).toHaveBeenCalled();
      // Verify that member joins coordinator
      expect(mockLiving.JoinGroup).toHaveBeenCalledWith('Küche');
    });
  });

  describe('HTTP REST endpoints', () => {
    test('GET /:raum/tunein/play/:stationId should play TuneIn station', async () => {
      const response = await request(app).get('/küche/tunein/play/68225');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /:raum/leave should make speaker leave group', async () => {
      const response = await request(app).get('/küche/leave');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /:raum/playpause should toggle state', async () => {
      const response = await request(app).get('/küche/playpause');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /:raum/clip/:file/:volume? should play clip', async () => {
      const response = await request(app).get('/küche/clip/bell.mp3/50');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /preset/:name should trigger preset application', async () => {
      // Mock presets folder loading
      const presetsDir = path.join(__dirname, '../presets');
      if (!fs.existsSync(presetsDir)) fs.mkdirSync(presetsDir);
      fs.writeFileSync(
        path.join(presetsDir, 'testpreset.json'),
        JSON.stringify({
          players: [{ roomName: 'Küche', volume: 10 }]
        }),
        'utf8'
      );

      const response = await request(app).get('/preset/testpreset');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Cleanup
      fs.unlinkSync(path.join(presetsDir, 'testpreset.json'));
    });

    test('CRUD /api/presets should get, create and delete presets', async () => {
      const newPreset = {
        name: 'testcreatelocal',
        config: {
          players: [{ roomName: 'Küche', volume: 15 }]
        }
      };

      // Create
      const postRes = await request(app)
        .post('/api/presets')
        .send(newPreset);
      expect(postRes.status).toBe(200);
      expect(postRes.body.success).toBe(true);

      // List
      const getRes = await request(app).get('/api/presets');
      expect(getRes.status).toBe(200);
      expect(getRes.body.success).toBe(true);
      expect(getRes.body.presets.some(p => p.name === 'testcreatelocal')).toBe(true);

      // Delete
      const deleteRes = await request(app).delete('/api/presets/testcreatelocal');
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);
    });
  });
});
