const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { config } = require('../config');

function readWorkbook(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found: ${filePath}`);
  }
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  return { workbook, sheetName, rows };
}

function rowsNeedingTranscription(rows) {
  const { recordingUrl, transcript } = config.columns;
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const url = (row[recordingUrl] || '').toString().trim();
      const existing = (row[transcript] || '').toString().trim();
      return url.length > 0 && existing.length === 0;
    });
}

function applyResultToRow(row, { transcript, summary }) {
  row[config.columns.transcript] = transcript || '';
  row[config.columns.summary] = summary || '';
}

function saveWorkbook(filePath, workbook, sheetName, rows) {
  const newSheet = XLSX.utils.json_to_sheet(rows);
  workbook.Sheets[sheetName] = newSheet;

  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp`);

  XLSX.writeFile(workbook, tmpPath);
  fs.renameSync(tmpPath, filePath);
}

module.exports = {
  readWorkbook,
  rowsNeedingTranscription,
  applyResultToRow,
  saveWorkbook,
};
