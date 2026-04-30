const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { config } = require('../config');
const log = require('../logger');

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

let anthropicClient = null;
function getAnthropicClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropicClient;
}

async function summarizeOllama(text) {
  const { baseUrl, model, timeoutMs } = config.summarizer.ollama;
  const start = log.now();
  log.info('summary', `start provider=ollama model=${model}`);

  let response;
  try {
    response = await axios.post(
      `${baseUrl}/api/chat`,
      {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 400 },
      },
      { timeout: timeoutMs }
    );
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      throw new Error(`Cannot reach Ollama at ${baseUrl}. Is "ollama serve" running?`);
    }
    if (err.response?.status === 404) {
      throw new Error(`Ollama model "${model}" not found. Run: ollama pull ${model}`);
    }
    throw new Error(`Ollama error: ${err.response?.data?.error || err.message}`);
  }

  const summary = (response.data?.message?.content || '').trim();
  const evalCount = response.data?.eval_count || 0;
  const promptCount = response.data?.prompt_eval_count || 0;

  if (!summary) {
    log.warn('summary', `ollama returned empty response (eval_count=${evalCount})`);
  } else {
    log.info(
      'summary',
      `ok ${summary.length} chars in ${log.ms(start)} (tokens in=${promptCount} out=${evalCount})`
    );
  }
  return summary;
}

async function summarizeAnthropic(text) {
  const start = log.now();
  log.info('summary', `start provider=anthropic model=${config.summarizer.anthropic.model}`);

  const message = await getAnthropicClient().messages.create({
    model: config.summarizer.anthropic.model,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
  });

  const block = message.content.find((b) => b.type === 'text');
  const summary = (block && block.text ? block.text : '').trim();

  if (!summary) {
    log.warn('summary', `anthropic returned empty (stop_reason=${message.stop_reason})`);
  } else {
    log.info(
      'summary',
      `ok ${summary.length} chars in ${log.ms(start)} (in=${message.usage?.input_tokens || '?'} out=${message.usage?.output_tokens || '?'} tokens)`
    );
  }
  return summary;
}

async function summarize(transcript) {
  const text = (transcript || '').trim();
  if (!text) {
    log.warn('summary', 'skipped — transcript is empty (audio likely too short, silent, or all hold music)');
    return 'No summary available.';
  }

  if (config.summarizer.provider === 'anthropic') {
    return summarizeAnthropic(text);
  }
  return summarizeOllama(text);
}

module.exports = { summarize };
