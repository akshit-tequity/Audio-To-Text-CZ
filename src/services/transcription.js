const whisper = require('./transcriber');
const elevenlabs = require('./elevenlabs');
const { config } = require('../config');

const PROVIDERS = {
  whisper,
  elevenlabs,
};

function resolveProvider(requested) {
  const name = (requested || config.transcriptionProvider || 'whisper').toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown transcription provider: "${name}". Supported: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return { name, transcribeAudio: provider.transcribeAudio };
}

module.exports = { resolveProvider };
