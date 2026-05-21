const fs = require('fs');
const path = require('path');
const googleTTS = require('google-tts-api');
const { generateTts, cleanupTts, TTS_DIR } = require('../src/tts');

// Mock google-tts-api
jest.mock('google-tts-api');

describe('TTS Synthesis', () => {
  const dummyBase64 = 'UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA'; // Tiny dummy base64 header
  
  beforeEach(() => {
    jest.clearAllMocks();
    googleTTS.getAudioBase64.mockResolvedValue(dummyBase64);

    // Ensure temp dir is clean of test files
    if (fs.existsSync(TTS_DIR)) {
      fs.readdirSync(TTS_DIR).forEach(file => {
        if (file !== '.gitkeep') {
          try {
            fs.unlinkSync(path.join(TTS_DIR, file));
          } catch (e) {}
        }
      });
    }
  });

  afterAll(() => {
    // Cleanup remaining test files
    if (fs.existsSync(TTS_DIR)) {
      fs.readdirSync(TTS_DIR).forEach(file => {
        if (file !== '.gitkeep') {
          try {
            fs.unlinkSync(path.join(TTS_DIR, file));
          } catch (e) {}
        }
      });
    }
  });

  test('should generate MP3 file from text', async () => {
    const filename = await generateTts('Hallo Welt', 'de');
    expect(filename).toMatch(/^tts-\d+-[a-f0-9]+\.mp3$/);
    
    const filePath = path.join(TTS_DIR, filename);
    expect(fs.existsSync(filePath)).toBe(true);

    const fileContent = fs.readFileSync(filePath);
    expect(fileContent.toString('base64')).toBe(dummyBase64);
    expect(googleTTS.getAudioBase64).toHaveBeenCalledWith('Hallo Welt', {
      lang: 'de',
      slow: false,
      host: 'https://translate.google.com',
      timeout: 10000
    });
  });

  test('should slice text longer than 200 characters', async () => {
    const longText = 'a'.repeat(250);
    const filename = await generateTts(longText, 'de');
    
    expect(googleTTS.getAudioBase64).toHaveBeenCalledWith('a'.repeat(200), {
      lang: 'de',
      slow: false,
      host: 'https://translate.google.com',
      timeout: 10000
    });
  });

  test('should clean up old files and preserve .gitkeep', async () => {
    const file1 = await generateTts('Text Eins', 'de');
    const file2 = await generateTts('Text Zwei', 'de');

    expect(fs.existsSync(path.join(TTS_DIR, file1))).toBe(true);
    expect(fs.existsSync(path.join(TTS_DIR, file2))).toBe(true);

    // Mock stats to simulate old files
    const now = Date.now();
    const mockStat = {
      mtimeMs: now - 10 * 60 * 1000 // 10 minutes old
    };
    jest.spyOn(fs, 'statSync').mockReturnValue(mockStat);

    // Run cleanup for files older than 5 minutes (300000 ms)
    cleanupTts(300000);

    // Restore original statSync
    fs.statSync.mockRestore();

    expect(fs.existsSync(path.join(TTS_DIR, file1))).toBe(false);
    expect(fs.existsSync(path.join(TTS_DIR, file2))).toBe(false);
    expect(fs.existsSync(path.join(TTS_DIR, '.gitkeep'))).toBe(true);
  });
});
