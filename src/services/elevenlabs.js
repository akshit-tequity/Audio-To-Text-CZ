const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const { config } = require('../config');
const log = require('../logger');

const ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';

async function transcribeAudio(audioPath) {
  if (!config.elevenlabs.apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not set');
  }

  const start = log.now();
  log.info('elevenlabs', `start model=${config.elevenlabs.model} lang=${config.elevenlabs.languageCode || 'auto'}`);

  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath));
  form.append('model_id', config.elevenlabs.model);
  if (config.elevenlabs.languageCode) {
    form.append('language_code', config.elevenlabs.languageCode);
  }

  let response;
  try {
    response = await axios.post(ENDPOINT, form, {
      headers: {
        ...form.getHeaders(),
        'xi-api-key': config.elevenlabs.apiKey,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 600_000, // 10 min cap for very long audio
    });
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    const detail = typeof body === 'string' ? body : JSON.stringify(body || {}).slice(0, 400);
    throw new Error(`ElevenLabs API error ${status || ''}: ${detail || err.message}`);
  }

  const { text = '', language_code = 'unknown', words = [] } = response.data || {};
  const duration = words.length ? Number(words[words.length - 1].end || 0) : 0;

  log.info(
    'elevenlabs',
    `ok lang=${language_code} audio=${duration.toFixed(1)}s text=${text.length} chars words=${words.length} in ${log.ms(start)}`
  );

  return {
    text,
    language: language_code,
    duration,
  };
}

module.exports = { transcribeAudio };
