# OpenAI Provider Verification

Task 14 checks the server-side OpenAI generation path before external user testing. The important safety rule is unchanged: provider keys stay in the server environment only. Do not put API keys in browser files, screenshots, Notion notes, GitHub comments, or committed documents.

## Current Verification Result

Latest run date: 2026-05-20

Canonical local checkout:

```text
C:\Users\Creaboo_human\Documents\Cookooi
```

An ignored `.dev.vars` file was present in the canonical local checkout and provided server-side OpenAI configuration to Wrangler. A temporary Wrangler dev server was started on `127.0.0.1:3014`, and one realistic recipe request completed through the provider-backed path.

The provider-backed smoke verified:

- `POST /api/recipes/generate` returned exactly three recipes.
- The response was labeled `source: "ai"`.
- The response was labeled `provider: "openai"`.
- A model value was present.
- The first recipe included food-safety notes and allergy notes.
- `.dev.vars` is ignored by Git.
- No provider secret was added to the repository.

Earlier Task 14 fallback checks also verified that with no `OPENAI_API_KEY` and fallback disabled, `POST /api/recipes/generate` returns `503 provider_unavailable`, and with `COOKOOI_ENABLE_FALLBACK=true`, the endpoint returns three clearly labeled fallback proposals with `source: "fallback"` and `provider: "fallback"`.

## Safe Local Provider Check

To repeat the real provider check locally, create an ignored `.dev.vars` file in the active local checkout:

```text
OPENAI_API_KEY=<server-side key>
OPENAI_MODEL=gpt-5.4-mini
```

Do not commit `.dev.vars`.

Start Cookooi with Wrangler:

```powershell
npm start
```

Then submit one realistic request to the local API:

```powershell
$body = @{
  ingredientsText = "rice, eggs, spinach, soy sauce"
  craving = "quick savory dinner"
  constraints = @{
    avoid = "peanuts"
    diet = "none"
    servings = 2
    maxTotalTimeMinutes = 30
    cuisineOrFlavor = "ginger garlic"
    equipment = @("stovetop")
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:3004/api/recipes/generate" `
  -ContentType "application/json" `
  -Body $body
```

A successful provider-backed response should have:

- exactly three recipes;
- `source: "ai"`;
- `provider: "openai"`;
- a model value matching the configured or default model;
- allergy and food-safety notes visible in the rendered UI;
- no API key in the browser response, logs, screenshots, Notion, or GitHub output.

## Fallback Regression Check

Fallback output remains useful for local workflow testing when provider configuration is unavailable:

```powershell
$env:COOKOOI_ENABLE_FALLBACK = "true"
npm run start:node
```

The fallback response must stay visibly labeled as fallback output, not AI-generated output.
