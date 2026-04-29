const express = require('express');
const { config, assertConfig } = require('./src/config');
const { connect } = require('./src/db');
const log = require('./src/logger');
const transcribeRouter = require('./src/routes/transcribe');
const transcriptsRouter = require('./src/routes/transcripts');

function requestLogger(req, _res, next) {
  if (req.path === '/health') return next();
  log.info('http', `${req.method} ${req.path}`);
  next();
}

async function main() {
  assertConfig();
  await connect();

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/transcribe', transcribeRouter);
  app.use('/transcripts', transcriptsRouter);

  app.use((err, _req, res, _next) => {
    log.error('server', err.message);
    res.status(500).json({ error: err.message });
  });

  app.listen(config.port, () => {
    log.info('server', `listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  log.error('server', `failed to start: ${err.message}`);
  process.exit(1);
});
