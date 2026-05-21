# Cookooi

Cookooi is a local recipe prototype. Enter ingredients you already have, optionally add what you are craving, and the app suggests three meal ideas with used ingredients and items still needed.

## Run

Install dependencies once from a fresh clone:

```powershell
npm ci
```

Then start Cookooi:

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

## Local workspace

Use `C:\Users\Creaboo_human\Documents\Cookooi` as the canonical human testing workspace for Cookooi. That path matches the product name and should be the only long-lived local checkout used for manual testing.

The GitHub repository remains `Creaboobot/CookMVP`. Automation execution still uses fresh generated clones under `C:\Users\Creaboo_human\Documents\CookooiAutomation\runs`; those run folders are task artifacts, not human workspaces.

Retired or stale local paths should not be used for Cookooi testing or edits:

- `C:\Users\Creaboo_human\Documents\CookMVP`
- `C:\Users\Creaboo_human\Documents\CookooiAutomation\CookMVP`
- `C:\Users\Creaboo_human\Documents\CookooiAutomation\infra-ci-worktree`

Before resetting or replacing any local checkout, preserve uncommitted files and confirm the current state with `git status --short --branch`. See `docs/local-workspace.md` for the normalization notes from Task 13.

Merged automation branches and stale worktrees are cleaned up using the policy in `docs/automation-cleanup.md`. Task 15 deleted merged `codex/*` task branches for PRs #1-#14 and removed the clean stale `infra-ci-worktree`; generated run folders and automation memory remain preserved for traceability.

## Agent operations

Future Cookooi task batches should run implementation under a publish-capable Windows identity, currently proven as `creaboo\Creaboo_human`. If scheduled runs execute as `creaboo\CodexSandboxOffline` and shell GitHub/npm HTTPS is blocked, the execution agent should use connector publish mode only when connector reads work and the mirror clone is current enough for safe local validation.

See `docs/agent-operations.md` for the required health-check command, mirror repair expectations, connector fallback rules, and the no-duplicate-support-task policy for the known runtime identity blocker.

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

See `docs/openai-provider-verification.md` for the Task 14 provider smoke-test note, including the current local configuration result and the safe steps for repeating a real OpenAI-backed check without exposing secrets.

## Testing privacy notes

Cookooi sends the ingredients the user has, any craving they add, and optional preferences to the server for immediate recipe generation. The UI tells testers not to enter sensitive personal information and reminds them to review AI-generated proposals for allergy, freshness, and cooking-safety decisions.

Saved recipes, feedback capture, and lightweight analytics are browser-local for the first testing pass. The app stores an anonymous local session id, full saved recipe objects, saved timestamps, generation links, generation success/failure records, fallback/source metadata, recipe ids, recipe ratings, optional tester notes, and saved-recipe markers. It does not store raw ingredients, cravings, avoidances, or free-text cuisine/flavor preferences in session analytics; those are reduced to counts, lengths, booleans, and selected non-sensitive options before storage. No accounts or server-side persistence are added.

Current local storage keys:

- `cookooi-session-v1`: anonymous local session id.
- `cookooi-library-v1`: saved recipe entries with full recipe detail, saved timestamp, source/model metadata, and generation id when available.
- `cookooi-feedback-v1`: generation records, recipe feedback, and saved-recipe markers.

Use the in-app session data controls to export/import a single JSON file for product review. The exported shape is:

```json
{
  "version": 1,
  "exportedAt": "2026-05-20T09:00:00.000Z",
  "sessionId": "cookooi-...",
  "savedRecipes": [],
  "feedbackData": {
    "version": 1,
    "sessionId": "cookooi-...",
    "generations": [],
    "feedback": [],
    "savedRecipeIds": []
  }
}
```

The import action also accepts the Task 9 feedback-only JSON format so older test exports can still be reviewed. Clear actions remove browser-local saved recipes and/or session data only; exported files are the recovery path after clearing.

## User testing readiness checklist

Before inviting testers, run the app from the current `main` branch and verify the same flow through the local route and, when the tunnel is active, the public route:

```text
http://127.0.0.1:3004
https://cookooi.creabooboard.win
```

Checklist:

1. From a fresh clone, run `npm ci`, then start Cookooi with `npm start`.
2. Confirm the home screen shows the planner, disclosure copy, recipe proposals area, saved recipe library, and session data controls.
3. Enter ingredients the tester has, optionally add a craving, then add at least one avoidance, servings, available time, cuisine or flavor, and available equipment.
4. Generate recipes and confirm exactly three proposals appear.
5. Confirm each proposal clearly shows whether it is AI-generated or fallback output, the items used, items still needed, steps, substitutions, dietary notes, allergy notes, food-safety notes, confidence notes, and source metadata.
6. Save one recipe, refresh the page, and confirm the saved recipe remains available with full details.
7. Rate one proposal, add an optional note, refresh the page, and confirm the session summary still counts the saved recipe, rating, and generation record.
8. Export session JSON, clear session data, import the exported JSON, and confirm the saved recipe and feedback return.
9. Test a known error path by running without `OPENAI_API_KEY` and confirm the message says generation is not configured instead of showing fake success.
10. Check desktop and mobile widths for readable controls, cards, saved recipe details, and session data actions.

If `OPENAI_API_KEY` is present in `.dev.vars` or the server environment, also run one OpenAI-backed generation and confirm the successful status says the proposals are AI-generated. If no provider key is configured, keep `COOKOOI_ENABLE_FALLBACK=true` for local workflow testing and record OpenAI-backed generation as not configured for that run.

## Tester instruction script

Use this short script for the first testing round:

```text
Cookooi helps turn ingredients you have into three meal ideas. Please do not enter sensitive personal information. Add a few ingredients, optionally add what you are craving, and include any allergies or ingredients you avoid. After the recipes appear, compare the items used and items still needed, open the details, save one recipe you might cook, and leave a Good fit or Needs work rating with an optional note. Recipes are AI-generated unless the app labels them as fallback output, so review allergy, freshness, and cooking-safety notes before cooking.
```

After each test session, use `Export session JSON` before clearing the browser-local session data.

## Known limitations for first testing

- Saved recipes, feedback, and session data are browser-local only.
- Exported session JSON is the only transfer or recovery path after clearing local data.
- OpenAI-backed generation depends on server-side `OPENAI_API_KEY` configuration; the app can use clearly labeled deterministic fallback output for local workflow testing.
- Cookooi provides recipe proposals, not safety, allergy, medical, or nutrition guarantees.
