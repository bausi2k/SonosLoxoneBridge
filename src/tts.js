const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const googleTTS = require('google-tts-api');
const { getSettings } = require('./settings');

const TTS_DIR = path.join(__dirname, '../public/temp/tts');

/**
 * Ensures that the TTS cache directory exists.
 */
function ensureTtsDir() {
  if (!fs.existsSync(TTS_DIR)) {
    fs.mkdirSync(TTS_DIR, { recursive: true });
  }
}

/**
 * Synthesizes text to a local MP3 file.
 * Automatically respects the 200-character limit of Google Translate TTS by slicing.
 * @param {string} text - The text to speak.
 * @param {string} [lang] - The language code (defaults to settings or 'de').
 * @returns {Promise<string>} The filename of the generated MP3 file.
 */
async function generateTts(text, lang) {
  if (!text) {
    throw new Error('Text is required for TTS synthesis');
  }

  const settings = getSettings();
  const language = lang || settings.ttsLanguage || 'de';

  // Squeeze/slice text to maximum 200 characters due to Google TTS API limit
  const sanitizedText = text.substring(0, 200).trim();

  try {
    ensureTtsDir();

    // Fetch audio from google-tts-api as base64
    const base64 = await googleTTS.getAudioBase64(sanitizedText, {
      lang: language,
      slow: false,
      host: 'https://translate.google.com',
      timeout: 10000
    });

    const buffer = Buffer.from(base64, 'base64');
    
    // Generate a unique filename using MD5 hash of text and language
    const hash = crypto.createHash('md5').update(`${sanitizedText}-${language}`).digest('hex');
    const filename = `tts-${Date.now()}-${hash}.mp3`;
    const filePath = path.join(TTS_DIR, filename);

    fs.writeFileSync(filePath, buffer);
    console.log(`[TTS] Synthesized text "${sanitizedText}" -> ${filename}`);

    return filename;
  } catch (err) {
    console.error('[TTS] Synthesis failed:', err);
    throw err;
  }
}

/**
 * Cleans up temporary TTS files older than the specified max age.
 * @param {number} [maxAgeMs=300000] - Maximum age of files in milliseconds (default: 5 minutes).
 */
function cleanupTts(maxAgeMs = 300000) {
  try {
    if (!fs.existsSync(TTS_DIR)) return;

    const files = fs.readdirSync(TTS_DIR);
    const now = Date.now();
    let deletedCount = 0;

    files.forEach(file => {
      if (file === '.gitkeep') return;

      const filePath = path.join(TTS_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (err) {
        // Ignore file errors
      }
    });

    if (deletedCount > 0) {
      console.log(`[TTS] Cleanup completed: Deleted ${deletedCount} expired audio file(s).`);
    }
  } catch (err) {
    console.error('[TTS] Cleanup failed:', err);
  }
}

module.exports = {
  generateTts,
  cleanupTts,
  TTS_DIR
};
