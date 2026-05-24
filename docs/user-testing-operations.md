# Cookooi User Testing Operations

## Purpose

This document gives testers and support operators a practical way to decide whether Cookooi is ready for a broader test round without reading source code. It covers local fallback testing, OpenAI-backed public testing, safe logging, rate limits, and common failure runbooks.

Cookooi still has no account UI, live account storage, public recipe UI, ranking, or recommendation launch in this task. Current saved recipes, settings, feedback, and session data remain browser-local.

## Runtime Health Endpoint

Cookooi exposes:

```text
GET /api/health
```

The endpoint returns JSON with:

- `status`: `ready`, `fallback_only`, or `configuration_needed`.
- `ready.localFallbackTesting`: true when local workflow testing can use OpenAI or deterministic fallback output.
- `ready.openAiBackedTesting`: true only when `OPENAI_API_KEY` is configured server-side.
- `checks.recipe_generation`: provider or fallback readiness for `POST /api/recipes/generate`.
- `checks.voice_transcription`: provider readiness for `POST /api/voice/transcribe`.
- `checks.feedback_capture`: browser-local feedback workflow state.
- `checks.privacy_safe_logging`: reminder that logs should use categories and metadata only.
- `checks.rate_limits`: current anonymous request bucket settings.
- `checks.public_route`: the public route that must be checked separately.

The health endpoint must not call OpenAI, transcribe audio, generate recipes, or return secret values. It reports whether configuration is present, not whether the provider is currently healthy.

Run a local check after starting Cookooi:

```powershell
npm run health:local
```

Run a public route check when the tunnel or deployed route is active:

```powershell
node scripts/runtime-health-check.mjs https://cookooi.creabooboard.win --require-openai
```

Use `--require-openai` only for real public testing readiness. Do not use it for local fallback testing.

## Environment Modes

| Mode | Required checks | Expected result |
| --- | --- | --- |
| Local fallback | `npm start` or `npm run start:node`, `COOKOOI_ENABLE_FALLBACK=true`, `GET /`, `GET /api/health`, one fallback recipe generation | Good for workflow, layout, export/import, saved recipes, feedback, and support runbook testing. Not a real provider test. |
| Local OpenAI-backed | `OPENAI_API_KEY` in server environment or ignored `.dev.vars`, `GET /api/health`, one generation, optional voice transcription | Good for proving local provider wiring. Keep keys server-side and out of logs. |
| Preview/public route | Public route `GET /`, public route `GET /api/health`, OpenAI-backed generation, voice transcription where microphone permissions allow it | Required before inviting broader testers. Record date, route, mode, and whether voice was automated or manual. |
| Production-like manual pass | Public route checks plus README user testing checklist | Required for the actual tester invite decision. Include mobile width and public HTTPS notes. |

## Required Health Checks

Before inviting testers, record these checks in the test handoff or support note:

| Area | Check | Pass condition |
| --- | --- | --- |
| Public route availability | `GET /` on `https://cookooi.creabooboard.win` | Returns Cookooi HTML and the planner loads. |
| Runtime status | `GET /api/health` on the target route | `status=ready` for public testing, or `fallback_only` only for local fallback testing. |
| OpenAI recipe generation | Submit one realistic recipe request | Exactly three proposals, `source: "ai"`, provider is OpenAI, and no secret appears in response or logs. |
| Fallback recipe generation | Run without `OPENAI_API_KEY` and with `COOKOOI_ENABLE_FALLBACK=true` | Exactly three proposals, clearly labeled fallback output. |
| Missing OpenAI configuration | Run without `OPENAI_API_KEY` and fallback off | `POST /api/recipes/generate` returns `503 provider_unavailable`. |
| Voice transcription | Upload or record one short supported audio note | Returns transcript from OpenAI when configured, or a clear text-input fallback message when not configured. |
| Feedback capture | Rate a proposal, add optional note, export session JSON | Export includes feedback metadata, saved markers, and no raw ingredients, craving, avoidances, voice transcript, or raw follow-up question in analytics records. |
| Privacy-safe logging | Inspect console, local terminal, and any support note | Use event categories, status codes, counts, lengths, route names, and provider state. Do not log raw ingredients, prompts, transcripts, avoidances, allergy text, private notes, or full feedback notes. |

## Simplified Get-Ideas Flow Smoke

Run this pass after UI copy, voice input, settings, or proposal rendering changes:

1. Load the target route and confirm the first screen shows one `Ingredients and craving` field, `Talk and get ideas`, `Get ideas`, compact `Settings`, and the compact `Before you cook` disclosure.
2. Open Settings, save at least one baseline preference, and confirm the first screen remains focused on the combined request field.
3. Enter a realistic combined request such as `eggs, spinach, feta, leftover rice, lemon. Something quick and savory. No peanuts, stovetop only, for two under 30 minutes.` and click `Get ideas`.
4. Confirm exactly three proposals render, proposal copy is concise, fallback or AI source labels are visible, and the request payload keeps parsed constraints plus saved baseline settings.
5. Click `Try three more` and confirm exactly three replacement proposals render without re-entering the request.
6. Open one proposal, ask one meal follow-up, and confirm the answer renders inside that proposal without replacing the original recipe.
7. Save one proposal, add one rating, and confirm session data counts generation, follow-up, feedback, and saved-recipe metadata without raw request or raw follow-up text.
8. At desktop width and about 390px mobile width, confirm there are no console errors, horizontal overflow, duplicate input fields, or stale pre-simplification copy.
9. For voice, use `Talk and get ideas` where microphone automation is available. If local/headless permission is blocked, record the fallback status and confirm the combined field remains usable.

## Rate Limits And Cost Controls

Current anonymous API limits default to:

```text
COOKOOI_RATE_LIMIT_MAX_REQUESTS=20
COOKOOI_RATE_LIMIT_WINDOW_MS=600000
```

Operational requirements:

- Keep fallback mode available for repeated local workflow checks so broad local testing does not spend provider budget.
- Use one realistic OpenAI-backed generation for readiness unless a support investigation needs more evidence.
- Use one short voice note for transcription readiness and keep audio under the 4 MB upload limit.
- For public testing, document the expected tester count, expected requests per tester, and whether voice transcription is in scope for that round.
- Future account tasks should add per-authenticated-user limits, anonymous session limits, and provider-cost budgets before account beta launch.
- Treat `provider_rate_limited` as a testing-capacity signal, not a product bug by itself.

## Logging And Error Categories

Use stable categories in support notes and future logs:

| Category | Meaning | Sensitive data rule |
| --- | --- | --- |
| `route_unavailable` | Home route or public route does not respond | Include route and status only. |
| `provider_unavailable` | OpenAI key missing or provider temporarily unavailable | Do not include provider secret, prompt, transcript, or raw error body. |
| `provider_rate_limited` | Provider or Cookooi rate limit was reached | Include retry timing and request mode only. |
| `provider_timeout` | Provider call took too long | Include endpoint and elapsed category only. |
| `invalid_request` | User request failed validation | Include validation category only, not raw request text. |
| `audio_too_large` | Voice note exceeded upload limit | Include size category and limit. |
| `unsupported_audio_type` | Uploaded audio type is not supported | Include MIME type only if it does not identify the user. |
| `fallback_enabled` | Deterministic fallback served local test output | Include that the response is not OpenAI-backed. |
| `deployment_failure` | Wrangler deploy or public route update failed | Include command, exit code, and non-secret error lines. |

## Support Runbooks

### OpenAI Missing

Symptoms:

- `/api/health` shows `configuration_needed`.
- Recipe generation returns `503 provider_unavailable`.
- Voice transcription returns a text-input fallback message.

Actions:

1. Confirm this is not an intentional local fallback test.
2. Check server-side environment or ignored `.dev.vars` for `OPENAI_API_KEY`.
3. Re-run `GET /api/health`.
4. Run one recipe generation. Use one short voice note only if transcription is in scope.
5. If the public route still lacks configuration, create or update a Cookooi Human Support Task with route, time, endpoint, status code, and missing configuration evidence.

### Transcription Failure

Symptoms:

- Voice upload returns `provider_unavailable`, `provider_timeout`, `audio_too_large`, or `unsupported_audio_type`.

Actions:

1. Check `/api/health` for `checks.voice_transcription.status`.
2. Verify the upload is under 4 MB and uses a supported audio type.
3. Retry once with a short known-good audio file.
4. If microphone automation is not possible, use the combined request field and record that physical iPhone Safari permission still needs a human spot-check when required.
5. Do not attach raw audio to support tasks unless a later explicit opt-in task approves diagnostic audio retention.

### Browser Microphone Permission

Symptoms:

- Recorder controls are unavailable.
- Browser denies microphone permission.
- Mobile browser requires a manual prompt.

Actions:

1. Confirm the route is HTTPS for browser recording.
2. Use the combined `Ingredients and craving` field when permission is blocked.
3. Record browser, viewport, route, and permission state.
4. For iPhone-only behavior, require physical device evidence or a manual tester note.

### Public Route Down

Symptoms:

- Public `GET /` fails or shows stale content.
- Public `GET /api/health` fails while local route works.

Actions:

1. Confirm local `GET /` and local `GET /api/health`.
2. Run `npx.cmd wrangler deploy --dry-run` to separate build validity from route availability.
3. Check recent deployment output for non-secret errors.
4. Create a support task if route or Cloudflare configuration needs human access.

### Fallback Recipe Mode

Symptoms:

- Responses show `source: "fallback"` and provider `fallback`.
- `/api/health` shows `fallback_only`.

Actions:

1. Use fallback mode for local workflow checks only.
2. Do not claim public OpenAI-backed readiness from fallback output.
3. If the tester round requires real provider output, configure `OPENAI_API_KEY` server-side and re-run `--require-openai`.

### Deployment Failure

Symptoms:

- `npx.cmd wrangler deploy --dry-run` fails.
- A public route does not update after a successful code change.

Actions:

1. Capture command, exit code, and non-secret error lines.
2. Confirm `npm.cmd test` and `node --check` results separately.
3. Do not expose provider keys, account secrets, database URLs, or raw user input in support notes.
4. Create a support task only when the failure requires human Cloudflare, DNS, or credential action.

## Feedback Workflow

The current feedback workflow remains the README user testing checklist plus browser-local session export:

1. Tester generates proposals.
2. Tester saves or rates one proposal and may add an optional note.
3. Operator exports session JSON before clearing data.
4. Operator stores or reviews the JSON according to the active testing process.
5. Product issues or operational blockers become Cookooi Human Support Tasks only when a concrete action is needed.

Feedback analytics must stay metadata-only by default. Full tester notes are private testing artifacts and should not be copied into public logs, public recipe data, ranking payloads, or GitHub comments.

## Handoff Template

Use this concise handoff after a readiness pass:

```text
Route:
Date/time:
Mode: local fallback | local OpenAI-backed | public OpenAI-backed
Health status:
Recipe generation: passed | failed | not run
Voice transcription: passed | failed | not in scope
Feedback export: passed | failed | not run
Mobile width: passed | failed | not run
Known limitations:
Support task needed: yes | no
```
