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

const mockBrowseResult = `&lt;DIDL-Lite xmlns:dc=&quot;http://purl.org/dc/elements/1.1/&quot; xmlns:upnp=&quot;urn:schemas-upnp-org:metadata-1-0/upnp/&quot; xmlns:r=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot; xmlns=&quot;urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/&quot;&gt;
  &lt;item id=&quot;FV:2/1&quot; parentID=&quot;FV:2&quot; restricted=&quot;true&quot;&gt;
    &lt;dc:title&gt;Klassik Radio&lt;/dc:title&gt;
    &lt;upnp:class&gt;object.item.audioItem.audioBroadcast&lt;/upnp:class&gt;
    &lt;desc id=&quot;cdudn&quot; nameSpace=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot;&gt;SA_RINCON65031_&lt;/desc&gt;
    &lt;res protocolInfo=&quot;x-sonosapi-stream:*:*:*&quot;&gt;x-sonosapi-stream:kr&lt;/res&gt;
    &lt;r:resMD&gt;&amp;lt;item id=&amp;quot;FV:2/1&amp;quot; parentID=&amp;quot;FV:2&amp;quot;&amp;gt;&amp;lt;upnp:class&amp;gt;object.item.audioItem.audioBroadcast&amp;lt;/upnp:class&amp;gt;&amp;lt;desc id=&amp;quot;cdudn&amp;quot;&amp;gt;SA_RINCON65031_&amp;lt;/desc&amp;gt;&amp;lt;/item&amp;gt;&lt;/r:resMD&gt;
  &lt;/item&gt;
  &lt;item id=&quot;FV:2/2&quot; parentID=&quot;FV:2&quot; restricted=&quot;true&quot;&gt;
    &lt;dc:title&gt;Baby Einschlafmusik&lt;/dc:title&gt;
    &lt;upnp:class&gt;object.container.playlistContainer&lt;/upnp:class&gt;
    &lt;desc id=&quot;cdudn&quot; nameSpace=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot;&gt;SA_RINCON2311_&lt;/desc&gt;
    &lt;res protocolInfo=&quot;x-rincon-cpcontainer:*:*:*&quot;&gt;x-rincon-cpcontainer:spotify:playlist&lt;/res&gt;
    &lt;r:resMD&gt;&amp;lt;item id=&amp;quot;FV:2/2&amp;quot; parentID=&amp;quot;FV:2&amp;quot;&amp;gt;&amp;lt;upnp:class&amp;gt;object.container.playlistContainer&amp;lt;/upnp:class&amp;gt;&amp;lt;desc id=&amp;quot;cdudn&amp;quot;&amp;gt;SA_RINCON2311_&amp;lt;/desc&amp;gt;&amp;lt;upnp:albumArtURI&amp;gt;http://example.com/art.jpg&amp;lt;/upnp:albumArtURI&amp;gt;&amp;lt;/item&amp;gt;&lt;/r:resMD&gt;
  &lt;/item&gt;
&lt;/DIDL-Lite&gt;`;

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
      SwitchToQueue: jest.fn().mockResolvedValue(true),
      AVTransportService: {
        GetTransportInfo: jest.fn().mockResolvedValue({ CurrentTransportState: 'PLAYING' }),
        SetAVTransportURI: jest.fn().mockResolvedValue(true),
        RemoveAllTracksFromQueue: jest.fn().mockResolvedValue(true),
        AddURIToQueue: jest.fn().mockResolvedValue(true)
      },
      RenderingControlService: {
        GetVolume: jest.fn().mockResolvedValue({ CurrentVolume: 25 })
      },
      ContentDirectoryService: {
        Browse: jest.fn().mockResolvedValue({ Result: mockBrowseResult })
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

  test('should parse and play stream favorites directly (SetAVTransportURI)', async () => {
    const playedTitle = await playFavorite('wohnzimmer', 'Klassik Radio');
    expect(playedTitle).toBe('Klassik Radio');
    
    expect(mockDevice.AVTransportService.SetAVTransportURI).toHaveBeenCalledWith({
      InstanceID: 0,
      CurrentURI: 'x-sonosapi-stream:kr',
      CurrentURIMetaData: {
        ItemId: 'FV:2/1',
        ParentId: 'FV:2',
        UpnpClass: 'object.item.audioItem.audioBroadcast',
        CdUdn: 'SA_RINCON65031_',
        AlbumArtUri: undefined,
        Title: 'Klassik Radio'
      }
    });
    expect(mockDevice.Play).toHaveBeenCalled();
    expect(sendPlayStatus).toHaveBeenCalledWith('Living Room', true);
  });

  test('should play container favorites via Queue routing (Clear Queue, Add to Queue, Switch, Play)', async () => {
    const playedTitle = await playFavorite('wohnzimmer', 'Baby Einschlafmusik');
    expect(playedTitle).toBe('Baby Einschlafmusik');

    expect(mockDevice.AVTransportService.RemoveAllTracksFromQueue).toHaveBeenCalledWith({ InstanceID: 0 });
    expect(mockDevice.AVTransportService.AddURIToQueue).toHaveBeenCalledWith({
      InstanceID: 0,
      EnqueuedURI: 'x-rincon-cpcontainer:spotify:playlist',
      EnqueuedURIMetaData: {
        ItemId: 'FV:2/2',
        ParentId: 'FV:2',
        UpnpClass: 'object.container.playlistContainer',
        CdUdn: 'SA_RINCON2311_',
        AlbumArtUri: 'http://example.com/art.jpg',
        Title: 'Baby Einschlafmusik'
      },
      DesiredFirstTrackNumberEnqueued: 1,
      EnqueueAsNext: true
    });
    expect(mockDevice.SwitchToQueue).toHaveBeenCalled();
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
