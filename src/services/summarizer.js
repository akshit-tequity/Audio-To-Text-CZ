const Anthropic = require('@anthropic-ai/sdk');
const { config } = require('../config');
const log = require('../logger');

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = [
  'You summarize customer-support call transcripts for an EV charging company.',
  'Produce a best-effort summary in 3-5 bullet points covering: the caller\'s main request or issue,',
  'any key details mentioned (location, vehicle type, station name, OCPP id, charger type),',
  'what the agent said or did, and the outcome (resolved / pending / referred elsewhere).',
  'Even if the transcript is short, fragmentary, noisy, or only one side of the conversation,',
  'still produce a summary based on whatever is there — describe what the caller appears to want',
  'and what was discussed. Never refuse, never apologize, never say "no summary available".',
  'Output plain text only — no markdown, no preamble.',
].join(' ');

async function summarize(transcript) {
  const text = (transcript || '').trim();
  if (!text) {
    log.warn('summary', 'skipped — transcript is empty (audio likely too short, silent, or all hold music)');
    return 'No summary available.';
  }

  const start = log.now();
  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
  });

  const block = message.content.find((b) => b.type === 'text');
  const summary = (block && block.text ? block.text : '').trim();

  if (!summary) {
    log.warn(
      'summary',
      `empty response from Claude (stop_reason=${message.stop_reason}) content=${JSON.stringify(message.content).slice(0, 300)}`
    );
  } else {
    log.info(
      'summary',
      `ok ${summary.length} chars in ${log.ms(start)} (in=${message.usage?.input_tokens || '?'} out=${message.usage?.output_tokens || '?'} tokens)`
    );
  }
  return summary;
}

module.exports = { summarize };
