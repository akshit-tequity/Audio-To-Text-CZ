const { spawn } = require('child_process');
const readline = require('readline');
const { config } = require('../config');
const log = require('../logger');

function transcribeAudio(audioPath) {
  return new Promise((resolve, reject) => {
    const args = [
      config.whisperRunner,
      audioPath,
      '--model', config.whisper.model,
      '--device', config.whisper.device,
      '--compute-type', config.whisper.computeType,
      '--language', config.whisper.language,
      '--task', config.whisper.task,
      '--beam-size', String(config.whisper.beamSize),
    ];
    if (config.whisper.initialPrompt) {
      args.push('--initial-prompt', config.whisper.initialPrompt);
    }
    if (config.whisper.hotwords) {
      args.push('--hotwords', config.whisper.hotwords);
    }

    const start = log.now();
    log.info(
      'whisper',
      `start model=${config.whisper.model} device=${config.whisper.device} lang=${config.whisper.language} task=${config.whisper.task} ` +
      `prompt=${config.whisper.initialPrompt ? 'set' : 'none'} hotwords=${config.whisper.hotwords ? 'set' : 'none'}`
    );

    const child = spawn(config.pythonBin, args);

    let stdout = '';
    let stderrBuffer = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

    // Stream stderr line-by-line so the user sees live progress
    // (faster-whisper logs model load, VAD, and download progress to stderr).
    const rl = readline.createInterface({ input: child.stderr });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      stderrBuffer += line + '\n';
      log.info('whisper.py', trimmed);
    });

    child.on('error', (err) => reject(err));

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`whisper_runner exited ${code}: ${stderrBuffer.trim()}`));
      }
      try {
        const result = JSON.parse(stdout.trim());
        log.info(
          'whisper',
          `ok lang=${result.language} audio=${result.duration?.toFixed(1)}s text=${result.text?.length || 0} chars in ${log.ms(start)}`
        );
        resolve(result);
      } catch (err) {
        reject(new Error(`Failed to parse whisper output: ${err.message}\nstdout: ${stdout}\nstderr: ${stderrBuffer}`));
      }
    });
  });
}

module.exports = { transcribeAudio };
