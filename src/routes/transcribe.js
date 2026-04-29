const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const { config } = require('../config');
const log = require('../logger');
const { startJob, getJob, listJobs } = require('../services/processor');

const router = express.Router();

if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.xlsx';
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') return cb(null, true);
    cb(new Error('Only .xlsx or .xls files are allowed'));
  },
});

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file (multipart field) is required' });
  }
  const provider = (req.body?.provider || '').trim().toLowerCase() || null;
  if (provider && !['whisper', 'elevenlabs'].includes(provider)) {
    return res.status(400).json({ error: `unknown provider "${provider}". Use "whisper" or "elevenlabs".` });
  }
  log.info(
    'upload',
    `received "${req.file.originalname}" (${log.bytes(req.file.size)}) provider=${provider || '(default)'} → ${path.basename(req.file.path)}`
  );
  const job = startJob(req.file.path, req.file.originalname, provider);
  res.status(202).json({
    jobId: job.jobId,
    status: job.status,
    originalName: job.originalName,
    provider: provider || 'default',
    startedAt: job.startedAt,
  });
});

router.get('/status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json({
    jobId: job.jobId,
    originalName: job.originalName,
    provider: job.provider,
    status: job.status,
    total: job.total,
    processed: job.processed,
    failed: job.failed,
    current: job.current,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    errors: job.errors,
  });
});

router.get('/result/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  if (job.status !== 'completed') {
    return res.status(409).json({ error: `job is ${job.status}, not completed` });
  }
  if (!fs.existsSync(job.filePath)) {
    return res.status(404).json({ error: 'result file not found on disk' });
  }
  const downloadName = job.originalName.replace(/(\.[^.]+)?$/, '_transcribed$1');
  res.download(job.filePath, downloadName);
});

router.get('/', (_req, res) => {
  res.json({ jobs: listJobs() });
});

router.use((err, _req, res, _next) => {
  if (err && err.message) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'unknown error' });
});

module.exports = router;
