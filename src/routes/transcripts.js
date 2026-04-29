const express = require('express');
const XLSX = require('xlsx');
const Transcript = require('../models/Transcript');
const log = require('../logger');

const router = express.Router();

function buildFilter(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.provider) filter['metadata.transcriptionProvider'] = query.provider;
  if (query.callId) filter.callId = query.callId;
  return filter;
}

function flattenMetadata(meta) {
  const flat = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (v == null) continue;
    if (v instanceof Date) flat[k] = v.toISOString();
    else if (typeof v === 'object') flat[k] = JSON.stringify(v);
    else flat[k] = v;
  }
  return flat;
}

// JSON: list / filter
router.get('/', async (req, res, next) => {
  try {
    const filter = buildFilter(req.query);
    const limit = Math.min(parseInt(req.query.limit || '0', 10) || 0, 5000);
    let q = Transcript.find(filter).sort({ createdAt: -1 }).lean();
    if (limit) q = q.limit(limit);
    const docs = await q;
    res.json({ count: docs.length, transcripts: docs });
  } catch (err) {
    next(err);
  }
});

// Excel export: every column from the doc + flattened metadata
router.get('/export', async (req, res, next) => {
  try {
    const filter = buildFilter(req.query);
    const docs = await Transcript.find(filter).sort({ createdAt: 1 }).lean();

    const rows = docs.map((d) => {
      const { metadata = {}, _id, __v, ...rest } = d;
      const meta = flattenMetadata(metadata);
      return {
        _id: _id?.toString() || '',
        recordingUrl: rest.recordingUrl,
        callId: rest.callId || '',
        provider: meta.transcriptionProvider || '',
        language: rest.language || '',
        durationSec: rest.durationSec || '',
        status: rest.status,
        transcript: rest.transcript || '',
        summary: rest.summary || '',
        error: rest.error || '',
        createdAt: rest.createdAt ? new Date(rest.createdAt).toISOString() : '',
        updatedAt: rest.updatedAt ? new Date(rest.updatedAt).toISOString() : '',
        ...meta,
      };
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'no transcripts match the filter' });
    }

    const sheet = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Transcripts');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `transcripts_export_${stamp}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);

    log.info('export', `exported ${rows.length} transcripts → ${filename}`);
  } catch (err) {
    next(err);
  }
});

// Single record by recordingUrl (URL-encoded)
router.get('/by-url', async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url query param is required' });
    const doc = await Transcript.findOne({ recordingUrl: url }).lean();
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
