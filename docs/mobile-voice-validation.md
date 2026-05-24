# Mobile Voice Validation

Task 27 validated the public HTTPS voice path on May 21, 2026.

## Target

- Public URL: `https://cookooi.creabooboard.win`
- Local origin: `http://127.0.0.1:3004`
- Code under test: GitHub `main` at `21b5349de941a7b8519c0a22b332c0da52b804c2`
- Server transcription model reported by the API: `gpt-4o-mini-transcribe`

## Result

Status: pass for the public HTTPS path that automation can exercise.

Evidence:

- Recovered the public route from an initial `502 Bad Gateway`.
- Normalized the canonical testing workspace from stale commit `a382c5b` to `21b5349` and restarted the stale port 3004 process.
- Confirmed the public root returned `200 OK` and served the recorder UI.
- Confirmed `GET /api/voice/transcribe` returned `405 Method Not Allowed` with `Allow: POST`.
- Confirmed `POST /api/voice/transcribe` with a generated speech WAV returned `200 OK`, `source: "ai"`, `provider: "openai"`, and the expected transcript:

```text
I have potatoes, bacon, kale, and cheddar. Make dinner for three in 30 minutes. No peanuts. Stovetop only.
```

- Confirmed `POST /api/recipes/generate` on the public route returned exactly three OpenAI-backed recipe proposals for the parsed request fields.
- Confirmed an automated 390px mobile Safari-profile browser smoke on the public HTTPS route:
  - secure context was true
  - `navigator.mediaDevices.getUserMedia` was available
  - `MediaRecorder` was available
  - the voice button moved from idle to recording state and back
  - transcription populated the editable request text
  - parsed request fields included available items, craving, avoidances, dinner, three servings, 30 minutes, and stovetop
  - generation produced three AI-backed proposal cards
  - no horizontal overflow appeared at the tested mobile width
- Confirmed unsupported upload recovery by posting `text/plain` audio and receiving `415 Unsupported Media Type` with a user-safe message.

## Human Device Note

Automation cannot grant or observe a physical iPhone microphone permission prompt. The next human tester pass should still spot-check the same URL on iPhone Safari, but the public HTTPS route, server-side transcription, request parsing, and recipe generation path are now verified with live OpenAI-backed endpoints.

## Supported Tester Path

1. Open `https://cookooi.creabooboard.win` in a secure browser context.
2. Tap `Talk and get ideas`.
3. Allow microphone permission when prompted.
4. Speak one short note with available items, optional craving, avoidances, servings, timing, and equipment.
5. Tap `Stop recording`.
6. Confirm the transcript lands in `Ingredients and craving`.
7. Verify three proposal cards appear.

If microphone access is denied or recording is unavailable, type or paste the full request in `Ingredients and craving` and use `Get ideas`.
