const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const axios = require('axios');
const { v4: uuid } = require('uuid');
const { config } = require('../config');
const log = require('../logger');

function ensureTmpDir() {
  if (!fs.existsSync(config.tmpDir)) {
    fs.mkdirSync(config.tmpDir, { recursive: true });
  }
}

async function downloadAudio(url) {
  ensureTmpDir();
  const filePath = path.join(config.tmpDir, `${uuid()}.mp3`);
  const start = log.now();

  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 60_000,
    maxRedirects: 5,
  });

  await pipeline(response.data, fs.createWriteStream(filePath));
  const size = fs.statSync(filePath).size;
  log.info('download', `ok ${log.bytes(size)} in ${log.ms(start)} → ${path.basename(filePath)}`);
  return filePath;
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    log.warn('download', `failed to delete ${filePath}: ${err.message}`);
  }
}

module.exports = { downloadAudio, safeUnlink };
