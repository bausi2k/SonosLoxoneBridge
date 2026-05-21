const request = require('supertest');
const app = require('../src/app');

// Mock sonos module entirely to avoid actual UPnP discovery or network socket binds during tests
jest.mock('../src/sonos', () => ({
  initializeSonos: jest.fn().mockResolvedValue(true),
  playRoom: jest.fn().mockResolvedValue(true),
  pauseRoom: jest.fn().mockResolvedValue(true),
  setRoomVolume: jest.fn().mockResolvedValue(30),
  playFavorite: jest.fn().mockResolvedValue('Favorite Radio'),
  sayRoom: jest.fn().mockResolvedValue('http://127.0.0.1:8888/temp/tts/tts-file.mp3'),
  getRoomStates: jest.fn().mockReturnValue([
    { name: 'Living Room', ip: '192.168.1.50', volume: 25, isPlaying: true }
  ]),
  getFavorites: jest.fn().mockResolvedValue([{ Title: 'Favorite Radio' }]),
  getLocalIp: jest.fn().mockReturnValue('192.168.1.100'),
  stopPolling: jest.fn()
}));

const sonosMock = require('../src/sonos');

describe('Express REST & Inbound API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loxone HTTP Inbound', () => {
    test('GET /:raum/play should start playback', async () => {
      const res = await request(app).get('/livingroom/play');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sonosMock.playRoom).toHaveBeenCalledWith('livingroom');
    });

    test('GET /:raum/pause should pause playback', async () => {
      const res = await request(app).get('/livingroom/pause');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sonosMock.pauseRoom).toHaveBeenCalledWith('livingroom');
    });

    test('GET /:raum/volume/:wert should set volume', async () => {
      const res = await request(app).get('/livingroom/volume/30');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sonosMock.setRoomVolume).toHaveBeenCalledWith('livingroom', '30');
    });

    test('GET /:raum/favorite/:name should play favorite', async () => {
      const res = await request(app).get('/livingroom/favorite/Favorite%20Radio');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sonosMock.playFavorite).toHaveBeenCalledWith('livingroom', 'Favorite Radio');
    });

    test('GET /:raum/say/:text/:volume should trigger TTS', async () => {
      const res = await request(app).get('/livingroom/say/Hello/40');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sonosMock.sayRoom).toHaveBeenCalledWith('livingroom', 'Hello', '40');
    });
  });

  describe('Frontend REST API', () => {
    test('GET /api/status should return system status', async () => {
      const res = await request(app).get('/api/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.rooms).toBeDefined();
      expect(res.body.settings).toBeDefined();
      expect(res.body.bridgeIp).toBe('192.168.1.100');
    });

    test('GET /api/favorites/:room should return list of favorites', async () => {
      const res = await request(app).get('/api/favorites/livingroom');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.favorites).toEqual([{ Title: 'Favorite Radio' }]);
    });

    test('POST /api/settings should write new settings', async () => {
      const res = await request(app)
        .post('/api/settings')
        .send({
          port: 8888,
          loxoneIp: '192.168.1.99',
          loxonePort: 7777,
          ttsLanguage: 'de',
          staticSpeakerIps: [],
          roomAliases: {}
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    describe('POST /api/control', () => {
      test('should support play action', async () => {
        const res = await request(app)
          .post('/api/control')
          .send({ room: 'livingroom', action: 'play' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(sonosMock.playRoom).toHaveBeenCalledWith('livingroom');
      });

      test('should support pause action', async () => {
        const res = await request(app)
          .post('/api/control')
          .send({ room: 'livingroom', action: 'pause' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(sonosMock.pauseRoom).toHaveBeenCalledWith('livingroom');
      });

      test('should support volume action', async () => {
        const res = await request(app)
          .post('/api/control')
          .send({ room: 'livingroom', action: 'volume', value: 45 });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(sonosMock.setRoomVolume).toHaveBeenCalledWith('livingroom', 45);
      });

      test('should support favorite action', async () => {
        const res = await request(app)
          .post('/api/control')
          .send({ room: 'livingroom', action: 'favorite', value: 'My Fav' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(sonosMock.playFavorite).toHaveBeenCalledWith('livingroom', 'My Fav');
      });

      test('should support say action (simple string)', async () => {
        const res = await request(app)
          .post('/api/control')
          .send({ room: 'livingroom', action: 'say', value: 'Hello' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(sonosMock.sayRoom).toHaveBeenCalledWith('livingroom', 'Hello');
      });

      test('should support say action (object with text and volume)', async () => {
        const res = await request(app)
          .post('/api/control')
          .send({ room: 'livingroom', action: 'say', value: { text: 'Hello', volume: 55 } });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(sonosMock.sayRoom).toHaveBeenCalledWith('livingroom', 'Hello', 55);
      });

      test('should return 400 if room or action missing', async () => {
        const res = await request(app)
          .post('/api/control')
          .send({ action: 'play' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      });
    });

    test('GET /api/loxone-export should trigger XML download', async () => {
      const res = await request(app).get('/api/loxone-export');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/xml');
      expect(res.headers['content-disposition']).toContain('VIU_SonosLoxoneBridge.xml');
      expect(res.text).toContain('<VirtualInUdp');
    });

    test('POST /api/discover should trigger discovery', async () => {
      const res = await request(app).post('/api/discover');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sonosMock.initializeSonos).toHaveBeenCalled();
    });
  });
});

