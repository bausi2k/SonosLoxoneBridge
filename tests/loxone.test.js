const dgram = require('dgram');
const { getSettings, saveSettings } = require('../src/settings');
const { normalizeRoomName, sendPlayStatus, sendVolumeStatus, generateLoxoneXml } = require('../src/loxone');

// Mock dgram
jest.mock('dgram');

describe('Loxone Integration', () => {
  let mockSocket;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket = {
      send: jest.fn((buffer, offset, length, port, ip, callback) => {
        if (callback) callback(null);
      }),
      close: jest.fn()
    };
    dgram.createSocket.mockReturnValue(mockSocket);

    // Save test settings
    saveSettings({
      loxoneIp: '192.168.1.99',
      loxonePort: 7777
    });
  });

  describe('normalizeRoomName', () => {
    test('should normalize standard room names', () => {
      expect(normalizeRoomName('Living Room')).toBe('livingroom');
      expect(normalizeRoomName('living-room')).toBe('livingroom');
      expect(normalizeRoomName('Küche')).toBe('kueche');
      expect(normalizeRoomName('Bad & WC')).toBe('badwc');
      expect(normalizeRoomName('Großes Zimmer')).toBe('grosseszimmer');
    });

    test('should handle empty names gracefully', () => {
      expect(normalizeRoomName('')).toBe('');
      expect(normalizeRoomName(null)).toBe('');
    });
  });

  describe('sendPlayStatus', () => {
    test('should send correct UDP command for play/pause state', () => {
      sendPlayStatus('Living Room', true);
      expect(dgram.createSocket).toHaveBeenCalledWith('udp4');
      expect(mockSocket.send).toHaveBeenCalled();
      
      const sendArgs = mockSocket.send.mock.calls[0];
      const message = sendArgs[0].toString();
      const port = sendArgs[3];
      const ip = sendArgs[4];

      expect(message).toBe('sonos.livingroom.play 1');
      expect(port).toBe(7777);
      expect(ip).toBe('192.168.1.99');
      expect(mockSocket.close).toHaveBeenCalled();
    });

    test('should send 0 when paused', () => {
      sendPlayStatus('Küche', false);
      const sendArgs = mockSocket.send.mock.calls[0];
      const message = sendArgs[0].toString();
      expect(message).toBe('sonos.kueche.play 0');
    });
  });

  describe('sendVolumeStatus', () => {
    test('should send correct UDP command for volume level', () => {
      sendVolumeStatus('Living Room', 35);
      const sendArgs = mockSocket.send.mock.calls[0];
      const message = sendArgs[0].toString();
      expect(message).toBe('sonos.livingroom.volume 35');
    });

    test('should bound volume values to 0-100', () => {
      sendVolumeStatus('Living Room', 120);
      expect(mockSocket.send.mock.calls[0][0].toString()).toBe('sonos.livingroom.volume 100');

      sendVolumeStatus('Living Room', -10);
      expect(mockSocket.send.mock.calls[1][0].toString()).toBe('sonos.livingroom.volume 0');
    });
  });

  describe('generateLoxoneXml', () => {
    test('should generate valid XML for discovered rooms', () => {
      const xml = generateLoxoneXml(['Living Room', 'Küche']);
      expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(xml).toContain('<VirtualInUdp HintText="" Title="SonosLoxoneBridge"');
      expect(xml).toContain('Port="7777"');
      
      // Check play command
      expect(xml).toContain('Check="sonos.livingroom.play \\v"');
      expect(xml).toContain('Title="Sonos Living Room Play"');
      
      // Check volume command
      expect(xml).toContain('Check="sonos.kueche.volume \\v"');
      expect(xml).toContain('Title="Sonos Küche Volume"');
      expect(xml).toContain('Unit="&lt;v&gt; %"');
    });
  });
});
