# Cookooi AI Recipe Contract

## Purpose

Cookooi generates practical meal ideas from items the user already has, an optional craving or goal, and optional constraints. This contract defines the server request, the AI response shape, validation rules, and food-safety boundaries that later implementation tasks must follow.

This task is documentation-only. Runtime behavior should not change until the server and UI tasks implement this contract.

## Request Contract

Cookooi should expose a server-side generation endpoint in a later task:

```http
POST /api/recipes/generate
Content-Type: application/json
```

The browser must send user input to the Cookooi server only. The browser must never call OpenAI directly and must never receive an API key.

```json
{
  "ingredientsText": "eggs, spinach, rice, cheddar",
  "craving": "quick dinner",
  "previousRecipeTitles": ["Spinach Rice Skillet"],
  "constraints": {
    "avoid": "peanuts",
    "diet": "vegetarian",
    "servings": 2,
    "maxTotalTimeMinutes": 30,
    "cuisineOrFlavor": "spicy",
    "equipment": ["stovetop", "microwave"],
    "mealType": "dinner"
  }
}
```

### Request Fields

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `ingredientsText` | string | yes | Free text describing items the user has. Trim before use. Reject empty values. Limit to 1000 characters for MVP. |
| `craving` | string | no | Optional free text describing what the user wants. Trim before use. Use a neutral default such as `flexible meal ideas` when empty. Limit to 200 characters for MVP. |
| `previousRecipeTitles` | string[] | no | Optional bounded list of previous proposal titles from the same request context. Used only to reduce exact repeats when the user asks for another set. Limit to 12 titles, 90 characters each. |
| `constraints` | object | no | Optional object for safety, preference, and practicality constraints. Unknown fields should be ignored or rejected consistently by the server. |
| `constraints.avoid` | string | no | Allergies, avoidances, disliked ingredients, or ingredients the user does not want used. Limit to 500 characters for MVP. |
| `constraints.diet` | string | no | One of `none`, `vegetarian`, `vegan`, `gluten-free`, `dairy-free`, `halal`, `kosher`, or `other`. |
| `constraints.servings` | number | no | Integer from 1 to 12. Default to 2 if absent. |
| `constraints.maxTotalTimeMinutes` | number | no | Integer from 5 to 240. Treat as desired total prep plus cook time. |
| `constraints.cuisineOrFlavor` | string | no | Optional cuisine, flavor, or style preference. Limit to 120 characters. |
| `constraints.equipment` | string[] | no | Available tools such as `stovetop`, `oven`, `microwave`, `blender`, `air fryer`, or `no-cook`. |
| `constraints.mealType` | string | no | One of `flexible`, `breakfast`, `lunch`, `dinner`, or `snack`. |

## Voice Note Input

The browser may offer a one-note input mode that lets the user speak or paste available items, optional craving, and constraints in natural language. The MVP voice parser converts the transcript into the same request fields above, shows the parsed interpretation for user review, and then sends only the structured request payload to `/api/recipes/generate`.

Voice-derived fields have higher priority than saved Settings defaults for the current request. The raw transcript must not be included in generation analytics, saved recipes, or exported session JSON by default.

## Response Contract

Successful generation returns exactly three recipe proposals.

```json
{
  "recipes": [
    {
      "title": "Spinach Cheddar Rice Skillet",
      "summary": "A fast skillet meal using eggs, spinach, rice, and cheddar.",
      "usesFromAvailableItems": ["eggs", "spinach", "rice", "cheddar"],
      "itemsStillNeeded": ["onion", "lemon"],
      "steps": [
        "Warm a skillet over medium heat.",
        "Add cooked rice and spinach until hot.",
        "Stir in beaten eggs and cook until set.",
        "Finish with cheddar and a squeeze of lemon."
      ],
      "prepTimeMinutes": 8,
      "cookTimeMinutes": 15,
      "servings": 2,
      "difficulty": "easy",
      "dietaryNotes": ["vegetarian"],
      "allergyNotes": ["Contains egg and dairy."],
      "foodSafetyNotes": ["Cook eggs until set unless using pasteurized eggs."],
      "substitutions": ["Use another melting cheese if cheddar is unavailable."],
      "confidenceNotes": "Assumes the rice is already cooked."
    },
    {
      "title": "Lemony Spinach Rice Bowl",
      "summary": "A light rice bowl with warm spinach, cheddar, and a bright lemon finish.",
      "usesFromAvailableItems": ["spinach", "rice", "cheddar"],
      "itemsStillNeeded": ["lemon", "olive oil"],
      "steps": [
        "Warm cooked rice in a pan or microwave.",
        "Wilt spinach with a small splash of water.",
        "Fold spinach into the rice.",
        "Top with cheddar and lemon juice."
      ],
      "prepTimeMinutes": 6,
      "cookTimeMinutes": 8,
      "servings": 2,
      "difficulty": "easy",
      "dietaryNotes": ["vegetarian"],
      "allergyNotes": ["Contains dairy."],
      "foodSafetyNotes": ["Reheat leftover rice until steaming hot."],
      "substitutions": ["Use vinegar if lemon is unavailable."],
      "confidenceNotes": "Assumes the rice was cooked and stored safely."
    },
    {
      "title": "Cheddar Egg Spinach Cups",
      "summary": "Simple baked egg cups using spinach and cheddar for a quick meal or snack.",
      "usesFromAvailableItems": ["eggs", "spinach", "cheddar"],
      "itemsStillNeeded": ["muffin tin", "black pepper"],
      "steps": [
        "Heat the oven to 180 C.",
        "Grease a muffin tin lightly.",
        "Divide chopped spinach and cheddar between cups.",
        "Pour in beaten eggs.",
        "Bake until the egg cups are set."
      ],
      "prepTimeMinutes": 10,
      "cookTimeMinutes": 18,
      "servings": 2,
      "difficulty": "easy",
      "dietaryNotes": ["vegetarian"],
      "allergyNotes": ["Contains egg and dairy."],
      "foodSafetyNotes": ["Cook eggs until fully set."],
      "substitutions": ["Use a small baking dish if no muffin tin is available."],
      "confidenceNotes": "Fits the craving if the user has oven access."
    }
  ],
  "source": "ai",
  "provider": "openai",
  "model": "gpt-5.4-mini",
  "createdAt": "2026-05-18T12:00:00.000Z"
}
```

### Recipe Fields

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `title` | string | yes | Human-readable recipe name. Maximum 90 characters. |
| `summary` | string | yes | One or two concise sentences. Maximum 240 characters. |
| `usesFromAvailableItems` | string[] | yes | Items from the user's submitted available items. Prefer exact user wording when safe and clear. |
| `itemsStillNeeded` | string[] | yes | Groceries or pantry items the user may not have. Use `[]` when nothing meaningful is needed. Keep practical and short. |
| `steps` | string[] | yes | Four to seven clear cooking steps. Each step should be short and actionable. |
| `prepTimeMinutes` | number | yes | Integer from 0 to 240. |
| `cookTimeMinutes` | number | yes | Integer from 0 to 240. |
| `servings` | number | yes | Integer from 1 to 12. Match request constraints when provided. |
| `difficulty` | string | yes | One of `easy`, `medium`, or `ambitious`. |
| `dietaryNotes` | string[] | yes | Notes about diet fit or caveats. Use `[]` if none. |
| `allergyNotes` | string[] | yes | Allergy and avoidance caveats. Use `[]` if none. |
| `foodSafetyNotes` | string[] | yes | Freshness, cross-contamination, raw-protein, or cooking-temperature notes. Use `[]` only when no specific note is relevant. |
| `substitutions` | string[] | yes | Practical swaps that preserve the recipe. Use `[]` if no useful substitution exists. |
| `confidenceNotes` | string | yes | Short note about assumptions, uncertainty, or why the suggestion fits. |

### Response Metadata

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `source` | string | yes | `ai` for provider output, `fallback` for deterministic fallback. |
| `provider` | string | yes | `openai` for OpenAI-backed output, `fallback` for deterministic fallback. |
| `model` | string | yes | Model id or `deterministic-fallback`. |
| `createdAt` | string | yes | ISO 8601 timestamp generated by the server. |
| `warning` | string | no | User-safe warning when fallback or degraded behavior occurs. |

## Validation Rules

The server must validate both request and response data.

- Reject non-JSON or malformed JSON requests with HTTP 400.
- Reject missing or empty `ingredientsText` with HTTP 400. Allow empty `craving` and use a neutral default for generation.
- Reject or trim inputs that exceed documented MVP limits. Prefer rejecting with a useful message when truncation would change safety meaning.
- Normalize whitespace for prompt construction, but preserve original user terms where useful for display.
- Require exactly three recipes in successful responses.
- Require all recipe fields listed above.
- Reject AI output that includes fields with the wrong type.
- Clamp or reject numeric fields outside documented bounds.
- Reject recipes that recommend using an ingredient listed in `constraints.avoid`.
- When previous recipe titles are provided, reject exact repeated titles or prompt the provider to avoid them.
- Reject or rewrite AI output that claims a food is definitely safe, allergen-free, medically appropriate, or nutritionally guaranteed.
- Detect clearly non-food requests before provider generation and return the food-only message instead of a recipe payload.
- Never return raw provider error payloads to the browser.

## Failure Behavior

The API should return user-safe errors or clearly labeled fallback output.

| Situation | Recommended behavior |
| --- | --- |
| Invalid request payload | HTTP 400 with a concise user-safe error. |
| Missing server-side API key | HTTP 503 or labeled fallback, depending on the active testing mode. |
| Provider timeout | HTTP 504 or labeled fallback. |
| Provider quota or rate limit | HTTP 429 with a friendly retry message. |
| Invalid AI output | HTTP 502 or labeled fallback after validation fails. |
| Unsafe AI output | Reject the output and retry once or return a safe error/fallback. |

Fallback output must set `source` and `provider` to `fallback`, include a `warning`, and match the same recipe field contract where possible.

## Off-Topic Request Behavior

Cookooi is for food recipe generation only. If the user asks for non-food content or clearly unrelated help, the API should return a short, friendly message instead of recipe JSON. The message should make clear that Cookooi can only create food recipes, and it may be lightly funny as long as it stays concise and respectful.

Example:

```json
{
  "error": "food_only",
  "message": "I only cook up food recipes here. Give me ingredients, and I will get back to the kitchen."
}
```

## Food-Safety And Allergy Boundaries

Cookooi provides recipe suggestions, not safety certification, medical advice, or nutrition advice.

- Do not claim that food is safe to eat based only on user input.
- Do not claim that a recipe is allergen-free. The system cannot assess cross-contamination.
- If the user mentions allergies or avoidances, the output should avoid those ingredients and include an allergy caveat.
- If input suggests spoiled, expired, moldy, unsafe, or raw-risk items, recommend discarding or checking safety before cooking.
- Include concise safety notes when raw meat, seafood, eggs, dairy, leftovers, or high-risk storage conditions are implied.
- Avoid precise internal-temperature advice unless it can be stated generally and safely. Prefer concise reminders such as "cook poultry thoroughly" over exhaustive food-safety tables.
- Do not provide medical, diet-treatment, weight-loss, or nutrition guarantees.

## Prompting Requirements

The server prompt should instruct the model to:

- Generate exactly three distinct recipes.
- Avoid exact repeated titles from `previousRecipeTitles` when that repeat hint is provided.
- Prefer items the user has.
- Keep items still needed practical and short.
- Respect avoidances, allergies, diet, meal type, available time, servings, and equipment.
- Include practical substitutions.
- Include concise food-safety and allergy notes where relevant.
- Return only structured JSON matching the schema.
- Avoid follow-up questions during generation.
- For non-food requests, skip recipe generation and return only the food-only response.

## Terminology Requirements

Use Cookooi as the app name. Avoid storage-location-specific language in user-facing output. Prefer:

- `items the user has`
- `ingredients available`
- `items used`
- `items still needed`
- `what the user does not have`

## Non-Goals For This Task

- No server endpoint implementation.
- No UI changes.
- No provider configuration changes.
- No persistence, analytics, or feedback collection changes.
