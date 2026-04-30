require('dotenv').config();

const path = require('path');

const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  mongoUri: process.env.MONGODB_URI,

  anthropicApiKey: process.env.ANTHROPIC_API_KEY,

  transcriptionProvider: (process.env.TRANSCRIPTION_PROVIDER || 'whisper').toLowerCase(),

  whisper: {
    model: process.env.WHISPER_MODEL || 'small',
    device: process.env.WHISPER_DEVICE || 'auto',
    computeType: process.env.WHISPER_COMPUTE_TYPE || 'default',
    language: process.env.WHISPER_LANGUAGE || 'auto',
    task: process.env.WHISPER_TASK || 'translate',
    initialPrompt: process.env.WHISPER_INITIAL_PROMPT || '',
    hotwords: process.env.WHISPER_HOTWORDS || '',
    beamSize: parseInt(process.env.WHISPER_BEAM_SIZE || '5', 10),
  },

  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    model: process.env.ELEVENLABS_MODEL || 'scribe_v1',
    languageCode: process.env.ELEVENLABS_LANGUAGE_CODE || null,
  },

  pythonBin: process.env.PYTHON_BIN || './venv/bin/python',
  whisperRunner: path.resolve(__dirname, '..', 'python', 'whisper_runner.py'),

  batchSaveEvery: parseInt(process.env.BATCH_SAVE_EVERY || '1', 10),
  tmpDir: path.resolve(process.env.TMP_DIR || './tmp'),
  uploadsDir: path.resolve(process.env.UPLOADS_DIR || './uploads'),
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '50', 10),

  columns: {
    recordingUrl: process.env.COL_RECORDING_URL || 'EX_RecordingUrls',
    transcript: process.env.COL_TRANSCRIPT || 'EX_Recording_Transcript',
    summary: process.env.COL_SUMMARY || 'EX_Recording_Summary',
  },
};

function assertConfig() {
  const missing = [];
  if (!config.mongoUri) missing.push('MONGODB_URI');
  if (!config.anthropicApiKey) missing.push('ANTHROPIC_API_KEY');
  if (config.transcriptionProvider === 'elevenlabs' && !config.elevenlabs.apiKey) {
    missing.push('ELEVENLABS_API_KEY');
  }
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

module.exports = { config, assertConfig };
