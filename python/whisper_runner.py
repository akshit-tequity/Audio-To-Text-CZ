#!/usr/bin/env python3
"""
Transcribe one audio file with faster-whisper and print a single JSON line to stdout.

Progress is emitted to stderr (one line per segment) so the Node side can show it live.

Usage:
    python whisper_runner.py <audio_path> \
        [--model small] [--compute-type int8] [--language auto]

Output (single JSON line on stdout):
    {"text": "...", "language": "en", "duration": 612.3}
"""
import argparse
import json
import sys
import time

from faster_whisper import WhisperModel


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def transcribe(
    audio_path: str,
    model_name: str,
    compute_type: str,
    language: str,
    task: str,
    initial_prompt: str,
    hotwords: str,
    beam_size: int,
) -> dict:
    log(f"loading model={model_name} compute={compute_type}")
    t0 = time.time()
    model = WhisperModel(model_name, device="cpu", compute_type=compute_type)
    log(f"model loaded in {time.time() - t0:.1f}s")

    lang_arg = None if language in (None, "", "auto") else language
    initial_prompt_arg = initial_prompt or None
    hotwords_arg = hotwords or None

    log(
        f"starting transcription (task={task}, beam_size={beam_size}, "
        f"initial_prompt={'set' if initial_prompt_arg else 'none'}, "
        f"hotwords={'set' if hotwords_arg else 'none'})"
    )
    t1 = time.time()
    segments, info = model.transcribe(
        audio_path,
        language=lang_arg,
        task=task,
        vad_filter=True,
        beam_size=beam_size,
        initial_prompt=initial_prompt_arg,
        hotwords=hotwords_arg,
        # Reduce hallucinations on silence / repeated text (helps "small" model).
        condition_on_previous_text=False,
        no_speech_threshold=0.6,
    )
    log(f"detected language={info.language} (prob={info.language_probability:.2f}) audio_duration={info.duration:.1f}s")

    # segments is a generator — iterate to drive transcription.
    text_parts = []
    seg_count = 0
    for seg in segments:
        seg_count += 1
        text_parts.append(seg.text)
        # Emit progress every 5 segments to avoid log spam on long files.
        if seg_count % 5 == 0 or seg_count == 1:
            pct = (seg.end / info.duration * 100) if info.duration else 0
            log(f"segment {seg_count} → {seg.end:.0f}s/{info.duration:.0f}s ({pct:.0f}%)")

    log(f"finished {seg_count} segments in {time.time() - t1:.1f}s")
    text = "".join(text_parts).strip()

    return {
        "text": text,
        "language": info.language,
        "duration": float(info.duration),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio_path")
    parser.add_argument("--model", default="small")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--language", default="auto")
    parser.add_argument("--task", default="transcribe", choices=["transcribe", "translate"])
    parser.add_argument("--initial-prompt", default="")
    parser.add_argument("--hotwords", default="")
    parser.add_argument("--beam-size", type=int, default=5)
    args = parser.parse_args()

    try:
        result = transcribe(
            args.audio_path,
            args.model,
            args.compute_type,
            args.language,
            args.task,
            args.initial_prompt,
            args.hotwords,
            args.beam_size,
        )
    except Exception as exc:
        log(f"whisper_runner error: {exc}")
        return 1

    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
