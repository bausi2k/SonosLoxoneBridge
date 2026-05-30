const http = require('http');
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
  playTuneIn,
  getActiveRooms,
  stopPolling,
  getRoomStates,
  getFavorites,
  parseTrackInfo,
  nextTrack,
  previousTrack,
  setRoomPlayMode,
  fetchBatteryStatus,
  parseBatteryXml,
  updateDeviceBatteryStatus
} = require('../src/sonos');
const { sendPlayStatus, sendVolumeStatus, normalizeRoomName } = require('../src/loxone');
const { generateTts } = require('../src/tts');

// Mock @svrooij/sonos
jest.mock('@svrooij/sonos', () => {
  const actual = jest.requireActual('@svrooij/sonos');
  return {
    SonosDevice: jest.fn(),
    SonosManager: jest.fn(),
    MetaDataHelper: actual.MetaDataHelper
  };
});
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
  &lt;item id=&quot;FV:2/3&quot; parentID=&quot;FV:2&quot; restricted=&quot;true&quot;&gt;
    &lt;dc:title&gt;Superfly.fm 98.3 (Soul &amp;amp; R&amp;amp;B)&lt;/dc:title&gt;
    &lt;upnp:class&gt;object.item.audioItem.audioBroadcast&lt;/upnp:class&gt;
    &lt;desc id=&quot;cdudn&quot; nameSpace=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot;&gt;SA_RINCON65031_&lt;/desc&gt;
    &lt;res protocolInfo=&quot;x-sonosapi-stream:*:*:*&quot;&gt;x-sonosapi-stream:s68225&lt;/res&gt;
    &lt;r:resMD&gt;&amp;lt;item id=&amp;quot;FV:2/3&amp;quot; parentID=&amp;quot;FV:2&amp;quot;&amp;gt;&amp;lt;upnp:class&amp;gt;object.item.audioItem.audioBroadcast&amp;lt;/upnp:class&amp;gt;&amp;lt;desc id=&amp;quot;cdudn&amp;quot;&amp;gt;SA_RINCON65031_&amp;lt;/desc&amp;gt;&amp;lt;/item&amp;gt;&lt;/r:resMD&gt;
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
        GetPositionInfo: jest.fn().mockResolvedValue({
          Track: 1,
          TrackDuration: '0:03:00',
          TrackMetaData: '&lt;dc:title&gt;Mock Track&lt;/dc:title&gt;&lt;dc:creator&gt;Mock Artist&lt;/dc:creator&gt;'
        }),
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
    // Allow background updates to complete
    await new Promise(resolve => setImmediate(resolve));
  });

  afterEach(() => {
    stopPolling();
  });

  test('should initialize static speaker', () => {
    expect(SonosDevice).toHaveBeenCalledWith('192.168.1.50');
    expect(mockDevice.LoadDeviceData).toHaveBeenCalled();
    expect(getActiveRooms()).toContain('Living Room');
  });

  test('should return detailed room states including now playing track', () => {
    const states = getRoomStates();
    expect(states).toHaveLength(1);
    expect(states[0]).toEqual({
      name: 'Living Room',
      ip: '192.168.1.50',
      volume: 25,
      isPlaying: true,
      currentTrack: {
        title: 'Mock Track',
        artist: 'Mock Artist',
        streamContent: '',
        albumArt: '',
        duration: '0:03:00'
      },
      playMode: 'NORMAL',
      diagnostics: {
        modelName: 'Sonos-Lautsprecher',
        modelNumber: '',
        softwareVersion: '',
        displayVersion: '',
        serialNumber: '',
        macAddress: ''
      },
      batteryLevel: null,
      isCharging: false,
      isOffline: false
    });
  });

  test('should parse track info and album art when XML tags have namespaces and attributes', () => {
    const posInfo = {
      Track: 1,
      TrackDuration: '0:03:00',
      TrackMetaData: '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/"><item><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Mock Track with Attribute</dc:title><dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">Mock Artist with Attribute</dc:creator><upnp:albumArtURI xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">/getaa?s=1&amp;u=x-sonosapi-stream</upnp:albumArtURI><r:streamContent xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">Streaming Info</r:streamContent></item></DIDL-Lite>'
    };
    
    const track = parseTrackInfo(posInfo);
    expect(track).toEqual({
      title: 'Mock Track with Attribute',
      artist: 'Mock Artist with Attribute',
      streamContent: 'Streaming Info',
      albumArt: '/getaa?s=1&u=x-sonosapi-stream',
      duration: '0:03:00'
    });
  });

  test('should parse track info when TrackMetaData is a pre-parsed object', () => {
    const posInfo = {
      Track: 1,
      TrackDuration: '0:04:30',
      TrackMetaData: {
        Title: 'Parsed Track Title',
        Artist: 'Parsed Artist Name',
        StreamContent: 'Streaming Content',
        AlbumArtUri: '/getaa?s=1&u=x-sonosapi-stream-object'
      }
    };

    const track = parseTrackInfo(posInfo);
    expect(track).toEqual({
      title: 'Parsed Track Title',
      artist: 'Parsed Artist Name',
      streamContent: 'Streaming Content',
      albumArt: '/getaa?s=1&u=x-sonosapi-stream-object',
      duration: '0:04:30'
    });
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

  test('should fall back to playing first favorite when play fails with UPnPError 701', async () => {
    const err701 = new Error('Sonos error on Play UPnPError 701 (Transition not available)');
    err701.name = 'SonosError';
    err701.UpnpErrorCode = 701;
    err701.UpnpErrorDescription = 'Transition not available';
    mockDevice.Play.mockRejectedValueOnce(err701).mockResolvedValue(true);

    await playRoom('wohnzimmer');
    
    expect(mockDevice.ContentDirectoryService.Browse).toHaveBeenCalled();
    expect(mockDevice.AVTransportService.SetAVTransportURI).toHaveBeenCalledWith({
      InstanceID: 0,
      CurrentURI: 'x-sonosapi-stream:kr',
      CurrentURIMetaData: expect.objectContaining({
        Title: 'Klassik Radio',
        UpnpClass: 'object.item.audioItem.audioBroadcast'
      })
    });
    expect(mockDevice.Play).toHaveBeenCalledTimes(2);
    expect(sendPlayStatus).toHaveBeenCalledWith('Living Room', true);
  });

  test('should fall back to switching to queue and playing when play fails with UPnPError 701 and no favorites exist', async () => {
    const err701 = new Error('Sonos error on Play UPnPError 701 (Transition not available)');
    err701.name = 'SonosError';
    err701.UpnpErrorCode = 701;
    err701.UpnpErrorDescription = 'Transition not available';
    mockDevice.Play.mockRejectedValueOnce(err701).mockResolvedValue(true);
    
    mockDevice.ContentDirectoryService.Browse.mockResolvedValueOnce({ Result: '' });

    await playRoom('wohnzimmer');

    expect(mockDevice.SwitchToQueue).toHaveBeenCalled();
    expect(mockDevice.Play).toHaveBeenCalledTimes(2);
    expect(sendPlayStatus).toHaveBeenCalledWith('Living Room', true);
  });

  test('should throw original error if all fallbacks fail on UPnPError 701', async () => {
    const err701 = new Error('Sonos error on Play UPnPError 701 (Transition not available)');
    err701.name = 'SonosError';
    err701.UpnpErrorCode = 701;
    err701.UpnpErrorDescription = 'Transition not available';
    mockDevice.Play.mockRejectedValue(err701);
    
    mockDevice.ContentDirectoryService.Browse.mockResolvedValueOnce({ Result: '' });
    mockDevice.SwitchToQueue.mockRejectedValue(new Error('SwitchToQueue failed'));

    await expect(playRoom('wohnzimmer')).rejects.toThrow('Transition not available');
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
      CurrentURIMetaData: expect.objectContaining({
        Title: 'Klassik Radio',
        UpnpClass: 'object.item.audioItem.audioBroadcast'
      })
    });
    expect(mockDevice.Play).toHaveBeenCalled();
    expect(sendPlayStatus).toHaveBeenCalledWith('Living Room', true);
  });

  test('should play favorite with volume setting if volume parameter is provided', async () => {
    const playedTitle = await playFavorite('wohnzimmer', 'Klassik Radio', 25);
    expect(playedTitle).toBe('Klassik Radio');
    expect(mockDevice.SetVolume).toHaveBeenCalledWith(25);
    expect(sendVolumeStatus).toHaveBeenCalledWith('Living Room', 25);
  });

  test('should pass track object with special characters to library for proper SOAP encoding', async () => {
    const playedTitle = await playFavorite('wohnzimmer', 'Superfly.fm 98.3 (Soul & R&B)');
    expect(playedTitle).toBe('Superfly.fm 98.3 (Soul & R&B)');
    
    // The library's SOAP serializer handles XML escaping internally,
    // so we pass the raw Track object with unescaped title.
    expect(mockDevice.AVTransportService.SetAVTransportURI).toHaveBeenCalledWith({
      InstanceID: 0,
      CurrentURI: 'x-sonosapi-stream:s68225',
      CurrentURIMetaData: expect.objectContaining({
        Title: 'Superfly.fm 98.3 (Soul & R&B)',
        UpnpClass: 'object.item.audioItem.audioBroadcast',
        CdUdn: 'SA_RINCON65031_'
      })
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
      EnqueuedURIMetaData: expect.objectContaining({
        Title: 'Baby Einschlafmusik',
        UpnpClass: 'object.container.playlistContainer'
      }),
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

  describe('playTuneIn', () => {
    test('should successfully play TuneIn station using modern S2 stream format', async () => {
      mockDevice.AVTransportService.SetAVTransportURI.mockResolvedValueOnce(true);
      await playTuneIn('wohnzimmer', '68225');
      
      expect(mockDevice.AVTransportService.SetAVTransportURI).toHaveBeenCalledWith({
        InstanceID: 0,
        CurrentURI: 'x-sonosapi-stream:tunein:68225?sid=303&flags=8232&sn=1',
        CurrentURIMetaData: expect.stringContaining('SA_RINCON303_')
      });
      expect(mockDevice.Play).toHaveBeenCalled();
    });

    test('should fallback to legacy S1 format if modern format fails', async () => {
      mockDevice.AVTransportService.SetAVTransportURI
        .mockRejectedValueOnce(new Error('UPnPError 402'))
        .mockResolvedValueOnce(true);
      
      await playTuneIn('wohnzimmer', '68225');
      
      expect(mockDevice.AVTransportService.SetAVTransportURI).toHaveBeenCalledTimes(2);
      expect(mockDevice.AVTransportService.SetAVTransportURI).toHaveBeenLastCalledWith({
        InstanceID: 0,
        CurrentURI: 'x-sonosapi-stream:s68225?sid=254&flags=8224&sn=0',
        CurrentURIMetaData: expect.stringContaining('SA_RINCON254_')
      });
      expect(mockDevice.Play).toHaveBeenCalled();
    });
  });

  test('should parse favorites and their album art when XML tags have namespaces and attributes', async () => {
    const browseResWithAttrs = `&lt;DIDL-Lite xmlns:dc=&quot;http://purl.org/dc/elements/1.1/&quot; xmlns:upnp=&quot;urn:schemas-upnp-org:metadata-1-0/upnp/&quot;&gt;
      &lt;item id=&quot;FV:2/4&quot;&gt;
        &lt;dc:title xmlns:dc=&quot;...&quot;&gt;Favorite with Attribute&lt;/dc:title>
        &lt;upnp:class xmlns:upnp=&quot;...&quot;&gt;object.item.audioItem.audioBroadcast&lt;/upnp:class&gt;
        &lt;res protocolInfo=&quot;*&quot;&gt;x-sonosapi-stream:attr&lt;/res&gt;
        &lt;r:resMD&gt;&amp;lt;item id=&amp;quot;FV:2/4&amp;quot;&amp;gt;&amp;lt;upnp:class xmlns:upnp=&amp;quot;...&amp;quot;&amp;gt;object.item.audioItem.audioBroadcast&amp;lt;/upnp:class&amp;gt;&amp;lt;upnp:albumArtURI xmlns:upnp=&amp;quot;...&amp;quot;&amp;gt;http://example.com/attr.jpg&amp;lt;/upnp:albumArtURI&amp;gt;&amp;lt;/item&amp;gt;&lt;/r:resMD&gt;
      &lt;/item&gt;
    &lt;/DIDL-Lite&gt;`;
    
    mockDevice.ContentDirectoryService.Browse.mockResolvedValueOnce({ Result: browseResWithAttrs });
    
    const favorites = await getFavorites('wohnzimmer');
    expect(favorites).toHaveLength(1);
    expect(favorites[0]).toEqual({
      Title: 'Favorite with Attribute',
      Uri: 'x-sonosapi-stream:attr',
      UpnpClass: 'object.item.audioItem.audioBroadcast',
      TrackMetadata: {
        ItemId: 'FV:2/4',
        ParentId: undefined,
        UpnpClass: 'object.item.audioItem.audioBroadcast',
        CdUdn: undefined,
        AlbumArtUri: 'http://example.com/attr.jpg',
        Title: 'Favorite with Attribute'
      }
    });
  });

  test('should trigger nextTrack', async () => {
    mockDevice.Next = jest.fn().mockResolvedValue(true);
    await nextTrack('wohnzimmer');
    expect(mockDevice.Next).toHaveBeenCalled();
  });

  test('should trigger previousTrack', async () => {
    mockDevice.Previous = jest.fn().mockResolvedValue(true);
    await previousTrack('wohnzimmer');
    expect(mockDevice.Previous).toHaveBeenCalled();
  });

  test('should trigger setRoomPlayMode', async () => {
    mockDevice.AVTransportService.SetPlayMode = jest.fn().mockResolvedValue(true);
    await setRoomPlayMode('wohnzimmer', 'SHUFFLE');
    expect(mockDevice.AVTransportService.SetPlayMode).toHaveBeenCalledWith({
      InstanceID: 0,
      NewPlayMode: 'SHUFFLE'
    });
  });

  describe('Battery Status Integration', () => {
    test('should parse battery XML correctly (charging)', () => {
      const xml = `
        <ZPSupportInfo>
          <LocalBatteryStatus>
            <Data name="Health">GREEN</Data>
            <Data name="Level">80</Data>
            <Data name="Temperature">NORMAL</Data>
            <Data name="PowerSource">SONOS_CHARGING_RING</Data>
          </LocalBatteryStatus>
        </ZPSupportInfo>
      `;
      const result = parseBatteryXml(xml);
      expect(result).toEqual({ level: 80, isCharging: true });
    });

    test('should parse battery XML correctly (discharging)', () => {
      const xml = `
        <ZPSupportInfo>
          <LocalBatteryStatus>
            <Data name="Health">GREEN</Data>
            <Data name="Level">45</Data>
            <Data name="Temperature">NORMAL</Data>
            <Data name="PowerSource">battery</Data>
          </LocalBatteryStatus>
        </ZPSupportInfo>
      `;
      const result = parseBatteryXml(xml);
      expect(result).toEqual({ level: 45, isCharging: false });
    });

    test('should return null for non-battery devices or empty XML', () => {
      const xml = `
        <ZPSupportInfo>
        </ZPSupportInfo>
      `;
      expect(parseBatteryXml(xml)).toBeNull();
      expect(parseBatteryXml('')).toBeNull();
    });

    test('should fetch and update battery status and reflect it in getRoomStates', async () => {
      const mockXml = `
        <ZPSupportInfo>
          <LocalBatteryStatus>
            <Data name="Level">95</Data>
            <Data name="PowerSource">SONOS_CHARGING_RING</Data>
          </LocalBatteryStatus>
        </ZPSupportInfo>
      `;

      const mockReq = {
        on: jest.fn(),
        destroy: jest.fn()
      };
      
      const httpSpy = jest.spyOn(http, 'get').mockImplementation((options, callback) => {
        const mockRes = {
          statusCode: 200,
          on: jest.fn((event, handler) => {
            if (event === 'data') {
              handler(Buffer.from(mockXml));
            }
            if (event === 'end') {
              handler();
            }
          })
        };
        callback(mockRes);
        return mockReq;
      });

      // Clear any prior batterySupported cache
      delete mockDevice.batterySupported;

      await updateDeviceBatteryStatus(mockDevice);

      expect(mockDevice.batterySupported).toBe(true);
      const states = getRoomStates();
      const livingRoom = states.find(s => s.name === 'Living Room');
      expect(livingRoom).toBeDefined();
      expect(livingRoom.batteryLevel).toBe(95);
      expect(livingRoom.isCharging).toBe(true);

      httpSpy.mockRestore();
    });

    test('should disable battery polling and clear state if speaker returns 404 (non-battery device)', async () => {
      const mockReq = {
        on: jest.fn(),
        destroy: jest.fn()
      };
      
      const httpSpy = jest.spyOn(http, 'get').mockImplementation((options, callback) => {
        const mockRes = {
          statusCode: 404,
          on: jest.fn()
        };
        callback(mockRes);
        return mockReq;
      });

      mockDevice.batterySupported = true;

      await updateDeviceBatteryStatus(mockDevice);

      expect(mockDevice.batterySupported).toBe(false);
      const states = getRoomStates();
      const livingRoom = states.find(s => s.name === 'Living Room');
      expect(livingRoom.batteryLevel).toBeNull();
      expect(livingRoom.isCharging).toBe(false);

      httpSpy.mockRestore();
    });

    test('should disable battery polling on connection refused errors', async () => {
      const mockReq = {
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'error') {
            // Simulate ECONNREFUSED socket error
            setImmediate(() => handler(new Error('connect ECONNREFUSED 192.168.1.50:1400')));
          }
          return mockReq;
        }),
        destroy: jest.fn()
      };
      
      const httpSpy = jest.spyOn(http, 'get').mockReturnValue(mockReq);

      mockDevice.batterySupported = true;

      await updateDeviceBatteryStatus(mockDevice);

      expect(mockDevice.batterySupported).toBe(false);
      const states = getRoomStates();
      const livingRoom = states.find(s => s.name === 'Living Room');
      expect(livingRoom.batteryLevel).toBeNull();

      httpSpy.mockRestore();
    });

    test('should skip fetching if batterySupported is already cached as false', async () => {
      const httpSpy = jest.spyOn(http, 'get');
      mockDevice.batterySupported = false;

      await updateDeviceBatteryStatus(mockDevice);

      expect(httpSpy).not.toHaveBeenCalled();
      httpSpy.mockRestore();
    });
  });

  describe('Offline Speaker Handling and Backoff', () => {
    test('should mark device offline and set backoff when network call fails with network error', async () => {
      const dev = getDevice('Living Room');
      dev.isOffline = undefined;
      dev.failedAttempts = 0;
      dev.offlineUntil = 0;
      
      const { updateDeviceState, deviceStates } = require('../src/sonos');
      const norm = normalizeRoomName(dev.Name);
      if (deviceStates[norm]) {
        deviceStates[norm].isOffline = false;
      }

      // Mock failure AFTER initialization so startup doesn't fail
      mockDevice.RenderingControlService.GetVolume.mockRejectedValueOnce(
        new Error('network timeout at: http://192.168.1.50:1400')
      );

      // Trigger update/polling
      await updateDeviceState(dev);

      expect(dev.isOffline).toBe(true);
      expect(dev.failedAttempts).toBe(1);
      expect(dev.offlineUntil).toBeGreaterThan(Date.now());
      
      const states = getRoomStates();
      const lr = states.find(s => s.name === 'Living Room');
      expect(lr.isOffline).toBe(true);
    });

    test('should skip state updating while offline backoff is active', async () => {
      const dev = getDevice('Living Room');
      dev.isOffline = true;
      dev.failedAttempts = 1;
      dev.offlineUntil = Date.now() + 10000; // 10s backoff

      mockDevice.RenderingControlService.GetVolume.mockClear();

      const { updateDeviceState } = require('../src/sonos');
      await updateDeviceState(dev);

      // Should skip getting volume
      expect(mockDevice.RenderingControlService.GetVolume).not.toHaveBeenCalled();
    });

    test('should mark device online and clear backoff when connection succeeds again', async () => {
      const dev = getDevice('Living Room');
      dev.isOffline = true;
      dev.failedAttempts = 2;
      dev.offlineUntil = Date.now() - 1000; // expired

      const { updateDeviceState, deviceStates } = require('../src/sonos');
      const norm = normalizeRoomName(dev.Name);
      if (deviceStates[norm]) {
        deviceStates[norm].isOffline = true;
      }

      mockDevice.RenderingControlService.GetVolume.mockResolvedValueOnce({ CurrentVolume: 30 });

      await updateDeviceState(dev);

      expect(dev.isOffline).toBe(false);
      expect(dev.failedAttempts).toBe(0);
      expect(dev.offlineUntil).toBe(0);
      
      const states = getRoomStates();
      const lr = states.find(s => s.name === 'Living Room');
      expect(lr.isOffline).toBe(false);
      expect(lr.volume).toBe(30);
    });
  });

  describe('Parallel Polling and Pause Error Handling', () => {
    test('pauseRoom should fallback to Stop on UPnPError 701 and notify Loxone', async () => {
      const dev = getDevice('Living Room');
      
      // Mock Pause to throw UPnPError 701
      const upnpError = new Error('Sonos error on Pause UPnPError 701 (Transition not available)');
      upnpError.UpnpErrorCode = 701;
      mockDevice.Pause.mockRejectedValueOnce(upnpError);
      
      // Mock Stop to succeed
      mockDevice.Stop = jest.fn().mockResolvedValueOnce(true);

      const { pauseRoom } = require('../src/sonos');
      await pauseRoom('Living Room');

      expect(mockDevice.Pause).toHaveBeenCalled();
      expect(mockDevice.Stop).toHaveBeenCalled();
      expect(sendPlayStatus).toHaveBeenCalledWith('Living Room', false);
    });
  });
});

