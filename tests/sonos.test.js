const { SonosDevice, SonosManager } = require('@svrooij/sonos');
const { getSettings, saveSettings } = require('../src/settings');
const { 
  initializeSonos, 
  getDevice, 
  playRoom, 
  pauseRoom, 
  setRoomVolume, 
  playFavorite, 
  sayRoom, 
  getActiveRooms,
  stopPolling
} = require('../src/sonos');
const { sendPlayStatus, sendVolumeStatus } = require('../src/loxone');
const { generateTts } = require('../src/tts');

// Mock @svrooij/sonos
jest.mock('@svrooij/sonos');
// Mock Loxone status triggers
jest.mock('../src/loxone', () => ({
  normalizeRoomName: jest.requireActual('../src/loxone').normalizeRoomName,
  sendPlayStatus: jest.fn(),
  sendVolumeStatus: jest.fn()
}));
// Mock TTS generation
jest.mock('../src/tts', () => ({
  generateTts: jest.fn().mockResolvedValue('tts-file.mp3')
}));

describe('Sonos Integration', () => {
  let mockDevice;

  beforeEach(async () => {
    jest.clearAllMocks();
    stopPolling();

    // Reset settings
    saveSettings({
      port: 8888,
      loxoneIp: '192.168.1.10',
      loxonePort: 7777,
      ttsLanguage: 'de',
      staticSpeakerIps: ['192.168.1.50'],
      roomAliases: { wohnzimmer: 'Living Room' }
    });

    // Create a rich mock SonosDevice
    mockDevice = {
      Name: 'Living Room',
      LoadDeviceData: jest.fn().mockResolvedValue(true),
      Play: jest.fn().mockResolvedValue(true),
      Pause: jest.fn().mockResolvedValue(true),
      SetVolume: jest.fn().mockResolvedValue(true),
      PlayNotification: jest.fn().mockResolvedValue(true),
      AVTransportService: {
        GetTransportInfo: jest.fn().mockResolvedValue({ CurrentTransportState: 'PLAYING' }),
        SetAVTransportURI: jest.fn().mockResolvedValue(true)
      },
      RenderingControlService: {
        GetVolume: jest.fn().mockResolvedValue({ CurrentVolume: 25 })
      },
      ContentDirectoryService: {
        BrowseParsedWithDefaults: jest.fn().mockResolvedValue([
          { Title: 'Radio Eins', Uri: 'x-sonosapi-stream:r1', MetaData: 'metadata-1' },
          { Title: 'Klassik Radio', Uri: 'x-sonosapi-stream:kr', MetaData: 'metadata-2' }
        ])
      }
    };

    SonosDevice.mockImplementation((ip) => {
      mockDevice.ip = ip;
      return mockDevice;
    });

    await initializeSonos();
  });

  afterEach(() => {
    stopPolling();
  });

  test('should initialize static speaker', () => {
    expect(SonosDevice).toHaveBeenCalledWith('192.168.1.50');
    expect(mockDevice.LoadDeviceData).toHaveBeenCalled();
    expect(getActiveRooms()).toContain('Living Room');
  });

  test('should lookup speaker by exact name or alias', () => {
    // Exact name lookup
    const device1 = getDevice('Living Room');
    expect(device1).toBe(mockDevice);

    // Case insensitive lookup
    const device2 = getDevice('living room');
    expect(device2).toBe(mockDevice);

    // Alias lookup
    const device3 = getDevice('wohnzimmer');
    expect(device3).toBe(mockDevice);
  });

  test('should throw error for unknown rooms', () => {
    expect(() => getDevice('Küche')).toThrow('Speaker for room "Küche" not found');
  });

  test('should trigger play and notify Loxone immediately', async () => {
    await playRoom('wohnzimmer');
    expect(mockDevice.Play).toHaveBeenCalled();
    expect(sendPlayStatus).toHaveBeenCalledWith('Living Room', true);
  });

  test('should trigger pause and notify Loxone immediately', async () => {
    await pauseRoom('wohnzimmer');
    expect(mockDevice.Pause).toHaveBeenCalled();
    expect(sendPlayStatus).toHaveBeenCalledWith('Living Room', false);
  });

  describe('setRoomVolume', () => {
    test('should set absolute volume', async () => {
      const target = await setRoomVolume('wohnzimmer', 45);
      expect(target).toBe(45);
      expect(mockDevice.SetVolume).toHaveBeenCalledWith(45);
      expect(sendVolumeStatus).toHaveBeenCalledWith('Living Room', 45);
    });

    test('should add relative volume with + prefix', async () => {
      const target = await setRoomVolume('wohnzimmer', '+10');
      expect(target).toBe(35); // 25 + 10 = 35
      expect(mockDevice.SetVolume).toHaveBeenCalledWith(35);
      expect(sendVolumeStatus).toHaveBeenCalledWith('Living Room', 35);
    });

    test('should subtract relative volume with - prefix', async () => {
      const target = await setRoomVolume('wohnzimmer', '-5');
      expect(target).toBe(20); // 25 - 5 = 20
      expect(mockDevice.SetVolume).toHaveBeenCalledWith(20);
      expect(sendVolumeStatus).toHaveBeenCalledWith('Living Room', 20);
    });

    test('should clamp relative volume to 0-100 bounds', async () => {
      const targetMin = await setRoomVolume('wohnzimmer', '-50');
      expect(targetMin).toBe(0);

      const targetMax = await setRoomVolume('wohnzimmer', '+200');
      expect(targetMax).toBe(100);
    });
  });

  test('should play favorites by name', async () => {
    const playedTitle = await playFavorite('wohnzimmer', 'Klassik Radio');
    expect(playedTitle).toBe('Klassik Radio');
    
    expect(mockDevice.AVTransportService.SetAVTransportURI).toHaveBeenCalledWith({
      InstanceID: 0,
      CurrentURI: 'x-sonosapi-stream:kr',
      CurrentURIMetaData: 'metadata-2'
    });
    expect(mockDevice.Play).toHaveBeenCalled();
    expect(sendPlayStatus).toHaveBeenCalledWith('Living Room', true);
  });

  test('should trigger sayRoom TTS and play notification', async () => {
    const ttsUrl = await sayRoom('wohnzimmer', 'Achtung, Bewegung im Garten', 50);
    expect(generateTts).toHaveBeenCalledWith('Achtung, Bewegung im Garten', 'de');
    expect(ttsUrl).toContain('/temp/tts/tts-file.mp3');
    
    expect(mockDevice.PlayNotification).toHaveBeenCalledWith({
      trackUri: ttsUrl,
      volume: 50,
      timeout: 20,
      onlyWhenPlaying: false
    });
  });
});
