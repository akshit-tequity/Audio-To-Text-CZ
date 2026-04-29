# CLAUDE.md

## Project Overview

This project is a batch audio transcription processor for Exotel call recordings.

The system reads recording URLs from an Excel sheet, downloads the audio, transcribes it using Whisper, stores the transcript in MongoDB, and updates the Excel sheet with the transcription result.

---

# Tech Stack

Preferred stack:

- Node.js
- Express.js
- MongoDB
- XLSX
- Axios
- OpenAI Whisper API OR faster-whisper integration
- Mongoose

---

# Important Development Rules

## DO NOT START CODING IMMEDIATELY

Before implementing anything:

1. Understand the complete requirement
2. Analyze the existing code structure
3. Ask clarifying questions if anything is unclear
4. Share the implementation plan first
5. Wait for approval before making major changes

Do not assume architecture decisions without confirmation.

---

# Keep The Solution Simple

This is intentionally a simple batch-processing system.

Avoid introducing:
- Kafka
- RabbitMQ
- BullMQ
- Microservices
- Complex worker systems
- Over-engineered abstractions
- Enterprise patterns unless explicitly requested

Prefer:
- readable code
- minimal dependencies
- simple processing flow

---

# Expected System Flow

```text
Excel
→ Download Exotel Audio
→ Transcription
→ Store Transcript in MongoDB
→ Update Excel