# Cookooi

Cookooi is a local recipe prototype. Enter ingredients you already have, add what you are craving, and the app suggests three meal ideas with used ingredients and items still needed.

## Run

```powershell
npm start
```

Open:

```text
http://127.0.0.1:3004
```

When the local Cloudflare tunnel is active, the same local service is available at:

```text
https://cookooi.creabooboard.win
```

`npm start` runs the Cloudflare Workers Static Assets runtime through Wrangler. The browser assets live in `public/`, matching the Worker asset configuration in `wrangler.jsonc`.

For a simple Node static fallback during local debugging, run:

```powershell
npm run start:node
```

The app is static and stores saved recipes in the browser's local storage. No AI behavior is changed by this runtime task.

## Recipe generation API

The server exposes:

```text
POST /api/recipes/generate
```

The endpoint reads provider configuration from the server environment only:

- `OPENAI_API_KEY`: required for OpenAI-backed recipe generation.
- `OPENAI_MODEL`: optional, defaults to `gpt-5.4-mini`.
- `COOKOOI_ENABLE_FALLBACK=true`: optional testing mode for deterministic fallback output when OpenAI is unavailable.

Do not put provider keys in browser files. For local Wrangler testing, keep secrets in `.dev.vars`, which is ignored by Git.

## Testing privacy notes

Cookooi sends the ingredients the user has, their craving, and optional preferences to the server for immediate recipe generation. The UI tells testers not to enter sensitive personal information and reminds them to review AI-generated proposals for allergy, freshness, and cooking-safety decisions.

Saved recipes are stored only in this browser's local storage during the current MVP.

Feedback capture and lightweight analytics are also browser-local for the first testing pass. The stored feedback JSON includes an anonymous local session id, generation success/failure records, fallback/source metadata, recipe ids, recipe ratings, optional tester notes, and saved-recipe markers. It does not store raw ingredients, cravings, avoidances, or free-text cuisine/flavor preferences; those are reduced to counts, lengths, booleans, and selected non-sensitive options before storage. No accounts or server-side persistence are added.
