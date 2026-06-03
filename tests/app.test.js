const request = require('supertest');
const app = require('../src/app');
const http = require('http');

// Mock sonos module entirely to avoid actual UPnP discovery or network socket binds during tests
jest.mock('../src/sonos', () => ({
  initializeSonos: jest.fn().mockResolvedValue(true),
  playRoom: jest.fn().mockResolvedValue(true),
  pauseRoom: jest.fn().mockResolvedValue(true),
  setRoomVolume: jest.fn().mockResolvedValue(30),
  playFavorite: jest.fn().mockResolvedValue('Favorite Radio'),
  sayRoom: jest.fn().mockResolvedValue('http://127.0.0.1:8888/temp/tts/tts-file.mp3'),
  nextTrack: jest.fn().mockResolvedValue(true),
  previousTrack: jest.fn().mockResolvedValue(true),
  setRoomPlayMode: jest.fn().mockResolvedValue(true),
  getRoomStates: jest.fn().mockReturnValue([
    { name: 'Living Room', ip: '192.168.1.50', volume: 25, isPlaying: true, playMode: 'NORMAL', batteryLevel: 85, isCharging: true }
  ]),
  getFavorites: jest.fn().mockResolvedValue([{ Title: 'Favorite Radio' }]),
  getLocalIp: jest.fn().mockReturnValue('192.168.1.100'),
  stopPolling: jest.fn(),
  formatError: jest.fn().mockImplementation(err => {
    if (!err) return null;
    return { message: err.message, stack: err.stack };
  })
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
      expect(sonosMock.playFavorite).toHaveBeenCalledWith('livingroom', 'Favorite Radio', undefined);
    });

    test('GET /:raum/favorite/:name/:volume should play favorite with volume', async () => {
      const res = await request(app).get('/livingroom/favorite/Favorite%20Radio/25');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sonosMock.playFavorite).toHaveBeenCalledWith('livingroom', 'Favorite Radio', '25');
    });

    test('GET /:raum/say/:text/:volume should trigger TTS', async () => {
      const res = await request(app).get('/livingroom/say/Hello/40');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sonosMock.sayRoom).toHaveBeenCalledWith('livingroom', 'Hello', '40');
    });
  });

  describe('Frontend REST API', () => {
    test('GET / should return index.html with tab structure and ambient blobs', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<div class="tab-navigation');
      expect(res.text).toContain('data-tab="speakers"');
      expect(res.text).toContain('data-tab="settings"');
      expect(res.text).toContain('data-tab="manual"');
      expect(res.text).toContain('id="tab-speakers"');
      expect(res.text).toContain('id="tab-settings"');
      expect(res.text).toContain('id="tab-manual"');
      expect(res.text).toContain('id="theme-toggle"');
      expect(res.text).toContain('<div class="bg-blob bg-blob-1"></div>');
      expect(res.text).toContain('<div class="bg-blob bg-blob-2"></div>');
      expect(res.text).toContain('<div class="bg-blob bg-blob-3"></div>');
      expect(res.text).toContain('<div class="bg-blob bg-blob-4"></div>');
    });

    test('GET /api/status should return system status', async () => {
      const res = await request(app).get('/api/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.rooms).toBeDefined();
      expect(res.body.rooms[0].batteryLevel).toBe(85);
      expect(res.body.rooms[0].isCharging).toBe(true);
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

      test('should support next action', async () => {
        const res = await request(app)
          .post('/api/control')
          .send({ room: 'livingroom', action: 'next' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(sonosMock.nextTrack).toHaveBeenCalledWith('livingroom');
      });

      test('should support previous action', async () => {
        const res = await request(app)
          .post('/api/control')
          .send({ room: 'livingroom', action: 'previous' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(sonosMock.previousTrack).toHaveBeenCalledWith('livingroom');
      });

      test('should support playmode action', async () => {
        const res = await request(app)
          .post('/api/control')
          .send({ room: 'livingroom', action: 'playmode', value: 'SHUFFLE' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(sonosMock.setRoomPlayMode).toHaveBeenCalledWith('livingroom', 'SHUFFLE');
      });

      test('should return 400 if room or action missing', async () => {
        const res = await request(app)
          .post('/api/control')
          .send({ action: 'play' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      });

      test('should return 500 with detailed error and stack trace on execution failure', async () => {
        sonosMock.playRoom.mockRejectedValueOnce(new Error('SOAP Error: Transition not available'));
        const res = await request(app)
          .post('/api/control')
          .send({ room: 'livingroom', action: 'play' });
        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe('SOAP Error: Transition not available');
        expect(res.body.details).toBeDefined();
        expect(res.body.details.message).toBe('SOAP Error: Transition not available');
        expect(res.body.details.stack).toBeDefined();
      });

      describe('Priority Flag support', () => {
        test('should support priority in POST play', async () => {
          const res = await request(app)
            .post('/api/control')
            .send({ room: 'livingroom', action: 'play', priority: true });
          expect(res.status).toBe(200);
          expect(sonosMock.playRoom).toHaveBeenCalledWith('livingroom', true);
        });

        test('should support priority in POST volume', async () => {
          const res = await request(app)
            .post('/api/control')
            .send({ room: 'livingroom', action: 'volume', value: 50, prio: 1 });
          expect(res.status).toBe(200);
          expect(sonosMock.setRoomVolume).toHaveBeenCalledWith('livingroom', 50, true);
        });

        test('should support priority in GET play', async () => {
          const res = await request(app).get('/livingroom/play?prio=true');
          expect(res.status).toBe(200);
          expect(sonosMock.playRoom).toHaveBeenCalledWith('livingroom', true);
        });

        test('should support priority in GET say', async () => {
          const res = await request(app).get('/livingroom/say/Hello/40?prio=1');
          expect(res.status).toBe(200);
          expect(sonosMock.sayRoom).toHaveBeenCalledWith('livingroom', 'Hello', '40', true);
        });
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

    describe('GET /api/art', () => {
      let httpGetSpy;

      beforeEach(() => {
        httpGetSpy = jest.spyOn(http, 'get');
      });

      afterEach(() => {
        httpGetSpy.mockRestore();
      });

      test('should return 400 if ip or path query parameter is missing', async () => {
        const res = await request(app).get('/api/art?ip=192.168.1.50');
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      });

      test('should return 403 if IP is not in active rooms list', async () => {
        const res = await request(app).get('/api/art?ip=192.168.1.99&path=/getaa');
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
      });

      test('should return 400 if path is invalid', async () => {
        const res = await request(app).get('/api/art?ip=192.168.1.50&path=../traversal');
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      });

      test('should proxy image and copy content headers on success', async () => {
        const { Readable } = require('stream');
        const mockStream = new Readable({
          read() {
            this.push('fake-image-bytes');
            this.push(null);
          }
        });
        mockStream.statusCode = 200;
        mockStream.headers = {
          'content-type': 'image/jpeg',
          'content-length': '16',
          'cache-control': 'public, max-age=86400'
        };

        httpGetSpy.mockImplementation((url, callback) => {
          setImmediate(() => {
            callback(mockStream);
          });
          return {
            on: jest.fn().mockReturnThis()
          };
        });

        const res = await request(app).get('/api/art?ip=192.168.1.50&path=/getaa');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/jpeg');
        expect(res.headers['content-length']).toBe('16');
        expect(res.headers['cache-control']).toBe('public, max-age=86400');
        expect(res.body.toString()).toBe('fake-image-bytes');
        expect(httpGetSpy).toHaveBeenCalledWith('http://192.168.1.50:1400/getaa', expect.any(Function));
      });

      test('should return 502 if proxy request fails', async () => {
        const mockClientRequest = {
          on: jest.fn().mockImplementation((event, handler) => {
            if (event === 'error') {
              handler(new Error('Connection timed out'));
            }
            return mockClientRequest;
          })
        };

        httpGetSpy.mockReturnValue(mockClientRequest);

        const res = await request(app).get('/api/art?ip=192.168.1.50&path=/getaa');
        expect(res.status).toBe(502);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('Connection timed out');
      });
    });

    describe('System logs', () => {
      test('GET /api/logs should return an array of logs', async () => {
        console.log('[Test] This is an info log');
        console.warn('[Test] This is a warn log');
        console.error('[Test] This is an error log');

        const res = await request(app).get('/api/logs');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.logs)).toBe(true);
        
        const infoLog = res.body.logs.find(log => log.level === 'INFO' && log.message.includes('[Test] This is an info log'));
        const warnLog = res.body.logs.find(log => log.level === 'WARN' && log.message.includes('[Test] This is a warn log'));
        const errorLog = res.body.logs.find(log => log.level === 'ERROR' && log.message.includes('[Test] This is an error log'));

        expect(infoLog).toBeDefined();
        expect(warnLog).toBeDefined();
        expect(errorLog).toBeDefined();
      });

      test('POST /api/logs/clear should purge logs', async () => {
        console.log('[Test] Before clear');
        let res = await request(app).get('/api/logs');
        expect(res.body.logs.length).toBeGreaterThan(0);

        const clearRes = await request(app).post('/api/logs/clear');
        expect(clearRes.status).toBe(200);
        expect(clearRes.body.success).toBe(true);

        res = await request(app).get('/api/logs');
        expect(res.body.logs.length).toBe(1);
        expect(res.body.logs[0].message).toContain('System-Protokoll gelöscht');
      });
    });
  });
});

