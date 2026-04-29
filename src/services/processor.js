const path = require('path');
const { v4: uuid } = require('uuid');
const { config } = require('../config');
const log = require('../logger');
const Transcript = require('../models/Transcript');
const {
  readWorkbook,
  rowsNeedingTranscription,
  applyResultToRow,
  saveWorkbook,
} = require('./excel');
const { downloadAudio, safeUnlink } = require('./downloader');
const { resolveProvider } = require('./transcription');
const { summarize } = require('./summarizer');

const jobs = new Map();

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function listJobs() {
  return Array.from(jobs.values()).map((j) => ({
    jobId: j.jobId,
    filePath: j.filePath,
    originalName: j.originalName,
    provider: j.provider,
    status: j.status,
    total: j.total,
    processed: j.processed,
    failed: j.failed,
    skipped: j.skipped,
    current: j.current,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
  }));
}

function deriveCallId(row, url) {
  const concat = (row.EX_Concat || '').toString().trim();
  if (concat) return concat;
  try {
    const tail = url.split('/').filter(Boolean).pop() || '';
    return tail.split('?')[0];
  } catch {
    return '';
  }
}

function buildMetadata(row) {
  const keys = [
    'EX_Direction', 'EX_Type', 'EX_From', 'EX_Status',
    'EX_StartTime', 'EX_EndTime', 'EX_Duration',
    'EX_DAY', 'EX_HOUR',
    'FD_Ticket_ID', 'FD_Subject', 'FD_Mobile',
    'FD_Category', 'FD_Sub_Category', 'FD_Status',
    'FD_Station_Name', 'FD_OCPP_ID', 'FD_Agent_name',
  ];
  const meta = {};
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') meta[k] = row[k];
  }
  return meta;
}

async function processOne(targetRow, audioPath, transcribeAudio, providerName) {
  const { row } = targetRow;
  const url = row[config.columns.recordingUrl].toString().trim();
  const callId = deriveCallId(row, url);
  const metadata = { ...buildMetadata(row), transcriptionProvider: providerName };

  const transcribeResult = await transcribeAudio(audioPath);
  const transcript = transcribeResult.text || '';
  const summary = await summarize(transcript);

  const dbStart = log.now();
  await Transcript.findOneAndUpdate(
    { recordingUrl: url },
    {
      recordingUrl: url,
      callId,
      transcript,
      summary,
      language: transcribeResult.language,
      durationSec: transcribeResult.duration,
      metadata,
      status: 'done',
      error: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  log.info('db', `upserted callId=${callId || '(none)'} in ${log.ms(dbStart)}`);

  applyResultToRow(row, { transcript, summary });
  return { transcript, summary };
}

async function recordFailure(url, callId, metadata, errorMessage) {
  try {
    await Transcript.findOneAndUpdate(
      { recordingUrl: url },
      {
        recordingUrl: url,
        callId,
        metadata,
        status: 'failed',
        error: errorMessage,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    log.error('db', `failed to record failure for ${url}: ${err.message}`);
  }
}

async function runJob(job) {
  const jobStart = log.now();
  const { name: providerName, transcribeAudio } = resolveProvider(job.provider);
  job.provider = providerName;
  log.info('job', `${job.jobId} starting on "${job.originalName}" provider=${providerName}`);

  const { workbook, sheetName, rows } = readWorkbook(job.filePath);
  const targets = rowsNeedingTranscription(rows);
  job.total = targets.length;
  job.status = 'running';
  log.info('job', `${job.jobId} found ${targets.length} rows to transcribe (sheet="${sheetName}", total rows in sheet=${rows.length})`);

  if (targets.length === 0) {
    job.status = 'completed';
    job.finishedAt = new Date().toISOString();
    saveWorkbook(job.filePath, workbook, sheetName, rows);
    log.info('job', `${job.jobId} done — nothing to transcribe`);
    return;
  }

  // Prefetch: download next while current is being transcribed/summarized.
  let nextDownload = downloadAudio(
    targets[0].row[config.columns.recordingUrl].toString().trim()
  ).catch((err) => ({ __error: err }));

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const url = target.row[config.columns.recordingUrl].toString().trim();
    const callId = deriveCallId(target.row, url);
    const metadata = buildMetadata(target.row);
    const rowStart = log.now();

    job.current = { index: target.index, url, callId };
    log.info('job', `${job.jobId} row ${i + 1}/${targets.length} → callId=${callId || '(none)'}`);

    let audioPath = null;
    try {
      const downloaded = await nextDownload;
      if (downloaded && downloaded.__error) throw downloaded.__error;
      audioPath = downloaded;

      // Kick off the next download in parallel.
      if (i + 1 < targets.length) {
        const nextUrl = targets[i + 1].row[config.columns.recordingUrl].toString().trim();
        nextDownload = downloadAudio(nextUrl).catch((err) => ({ __error: err }));
      }

      await processOne(target, audioPath, transcribeAudio, providerName);
      job.processed += 1;
      log.info('job', `${job.jobId} row ${i + 1}/${targets.length} done in ${log.ms(rowStart)} (ok=${job.processed} fail=${job.failed})`);
    } catch (err) {
      job.failed += 1;
      job.errors.push({ index: target.index, url, message: err.message });
      log.error('job', `${job.jobId} row ${i + 1}/${targets.length} FAILED: ${err.message}`);
      await recordFailure(url, callId, metadata, err.message);
    } finally {
      safeUnlink(audioPath);
    }

    if ((i + 1) % config.batchSaveEvery === 0) {
      try {
        const saveStart = log.now();
        saveWorkbook(job.filePath, workbook, sheetName, rows);
        log.info('excel', `saved batch after ${i + 1} rows in ${log.ms(saveStart)}`);
      } catch (err) {
        log.error('excel', `save failed: ${err.message}`);
      }
    }
  }

  const finalSaveStart = log.now();
  saveWorkbook(job.filePath, workbook, sheetName, rows);
  log.info('excel', `final save in ${log.ms(finalSaveStart)}`);

  job.current = null;
  job.status = 'completed';
  job.finishedAt = new Date().toISOString();
  log.info(
    'job',
    `${job.jobId} completed in ${log.ms(jobStart)} — processed=${job.processed} failed=${job.failed}`
  );
}

function startJob(filePath, originalName = null, provider = null) {
  const jobId = uuid();
  const job = {
    jobId,
    filePath,
    originalName: originalName || path.basename(filePath),
    provider: provider || null,
    status: 'queued',
    total: 0,
    processed: 0,
    failed: 0,
    skipped: 0,
    current: null,
    errors: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  jobs.set(jobId, job);

  runJob(job).catch((err) => {
    job.status = 'failed';
    job.finishedAt = new Date().toISOString();
    job.errors.push({ message: err.message });
    log.error('job', `${jobId} crashed: ${err.message}`);
  });

  return job;
}

module.exports = { startJob, getJob, listJobs };
