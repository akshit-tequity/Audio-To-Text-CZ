const { mongoose } = require('../db');

const transcriptSchema = new mongoose.Schema(
  {
    recordingUrl: { type: String, required: true, unique: true, index: true },
    callId: { type: String, index: true },
    transcript: { type: String, default: '' },
    summary: { type: String, default: '' },
    language: { type: String },
    durationSec: { type: Number },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['pending', 'done', 'failed'],
      default: 'pending',
      index: true,
    },
    error: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transcript', transcriptSchema);
