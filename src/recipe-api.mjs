const MAX_BODY_BYTES = 20_000;
const DEFAULT_MODEL = "gpt-5.4-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const allowedDiets = new Set(["none", "vegetarian", "vegan", "gluten-free", "dairy-free", "halal", "kosher", "other"]);
const allowedEquipment = new Set(["oven", "stovetop", "microwave", "blender", "air-fryer"]);
const allowedConstraintFields = new Set([
  "avoid",
  "diet",
  "servings",
  "maxTotalTimeMinutes",
  "cuisineOrFlavor",
  "equipment",
]);
const recipeDifficulties = new Set(["easy", "medium", "ambitious"]);
const nonFoodSignals = [
  "code",
  "debug",
  "essay",
  "email",
  "homework",
  "javascript",
  "legal",
  "math",
  "poem",
  "python",
  "resume",
  "stock",
];
const foodSignals = [
  "apple",
  "bean",
  "beef",
  "bread",
  "carrot",
  "cheese",
  "chicken",
  "egg",
  "fish",
  "flour",
  "garlic",
  "milk",
  "mushroom",
  "noodle",
  "onion",
  "pasta",
  "pepper",
  "potato",
  "rice",
  "soup",
  "spinach",
  "tofu",
  "tomato",
];
const unsafeClaims = [
  "allergen-free",
  "allergen free",
  "definitely safe",
  "guaranteed safe",
  "medically appropriate",
  "nutritionally guaranteed",
];

export async function handleGenerateRecipeRequest(request, env = {}, options = {}) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed", message: "Use POST to generate Cookooi recipes." }, 405, {
      allow: "POST",
    });
  }

  let payload;
  try {
    payload = await parseJsonRequest(request);
  } catch (error) {
    return jsonResponse({ error: "invalid_json", message: error.message }, 400);
  }

  const validation = validateRecipeRequest(payload);
  if (!validation.ok) {
    return jsonResponse({ error: "invalid_request", message: validation.message }, 400);
  }

  const recipeRequest = validation.value;
  if (isClearlyOffTopic(recipeRequest)) {
    return jsonResponse(
      {
        error: "food_only",
        message: "I only cook up food recipes here. Give me ingredients and a craving, and I will get back to the kitchen.",
      },
      400,
    );
  }

  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL || DEFAULT_MODEL;
  const fallbackEnabled = env.COOKOOI_ENABLE_FALLBACK === "true";

  if (!apiKey) {
    if (fallbackEnabled) {
      return jsonResponse(createFallbackResponse(recipeRequest, model, "OpenAI is not configured for this environment."), 200);
    }

    return jsonResponse(
      { error: "provider_unavailable", message: "Recipe generation is not configured yet. Please try again later." },
      503,
    );
  }

  try {
    const aiResponse = await generateWithOpenAI(recipeRequest, { apiKey, model, fetcher: options.fetcher || fetch });
    const parsed = parseProviderJson(aiResponse);
    const validationResult = validateRecipeResponse(parsed, recipeRequest);

    if (!validationResult.ok) {
      if (fallbackEnabled) {
        return jsonResponse(createFallbackResponse(recipeRequest, model, "AI output could not be validated."), 200);
      }

      return jsonResponse({ error: "invalid_ai_output", message: "Cookooi could not validate the recipe response." }, 502);
    }

    return jsonResponse({
      recipes: validationResult.recipes,
      source: "ai",
      provider: "openai",
      model,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const providerError = classifyProviderError(error);

    if (fallbackEnabled && providerError.status !== 429) {
      return jsonResponse(createFallbackResponse(recipeRequest, model, providerError.fallbackWarning), 200);
    }

    return jsonResponse({ error: providerError.code, message: providerError.message }, providerError.status);
  }
}

async function parseJsonRequest(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Send the request as JSON.");
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    throw new Error("Request body is too large.");
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function validateRecipeRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return invalid("Request body must be a JSON object.");
  }

  const ingredientsText = cleanText(payload.ingredientsText);
  if (!ingredientsText) {
    return invalid("Add ingredients available before generating recipes.");
  }
  if (ingredientsText.length > 1000) {
    return invalid("Ingredients text must be 1000 characters or fewer.");
  }

  const craving = cleanText(payload.craving);
  if (!craving) {
    return invalid("Add a craving or goal before generating recipes.");
  }
  if (craving.length > 200) {
    return invalid("Craving must be 200 characters or fewer.");
  }

  const constraints = payload.constraints === undefined ? {} : payload.constraints;
  if (!constraints || typeof constraints !== "object" || Array.isArray(constraints)) {
    return invalid("Constraints must be an object when provided.");
  }

  for (const field of Object.keys(constraints)) {
    if (!allowedConstraintFields.has(field)) {
      return invalid(`Unsupported constraint field: ${field}.`);
    }
  }

  const normalizedConstraints = {
    servings: 2,
  };

  if (constraints.avoid !== undefined) {
    if (typeof constraints.avoid !== "string") {
      return invalid("Avoidances must be text.");
    }
    normalizedConstraints.avoid = cleanText(constraints.avoid);
    if (normalizedConstraints.avoid.length > 500) {
      return invalid("Avoidances must be 500 characters or fewer.");
    }
  }

  if (constraints.diet !== undefined) {
    if (typeof constraints.diet !== "string" || !allowedDiets.has(constraints.diet)) {
      return invalid("Diet must be one of the supported diet options.");
    }
    normalizedConstraints.diet = constraints.diet;
  }

  if (constraints.servings !== undefined) {
    if (!Number.isInteger(constraints.servings) || constraints.servings < 1 || constraints.servings > 12) {
      return invalid("Servings must be an integer from 1 to 12.");
    }
    normalizedConstraints.servings = constraints.servings;
  }

  if (constraints.maxTotalTimeMinutes !== undefined) {
    if (
      !Number.isInteger(constraints.maxTotalTimeMinutes) ||
      constraints.maxTotalTimeMinutes < 5 ||
      constraints.maxTotalTimeMinutes > 240
    ) {
      return invalid("Maximum total time must be an integer from 5 to 240 minutes.");
    }
    normalizedConstraints.maxTotalTimeMinutes = constraints.maxTotalTimeMinutes;
  }

  if (constraints.cuisineOrFlavor !== undefined) {
    if (typeof constraints.cuisineOrFlavor !== "string") {
      return invalid("Cuisine or flavor must be text.");
    }
    normalizedConstraints.cuisineOrFlavor = cleanText(constraints.cuisineOrFlavor);
    if (normalizedConstraints.cuisineOrFlavor.length > 120) {
      return invalid("Cuisine or flavor must be 120 characters or fewer.");
    }
  }

  if (constraints.equipment !== undefined) {
    if (!Array.isArray(constraints.equipment) || constraints.equipment.some((item) => typeof item !== "string")) {
      return invalid("Equipment must be a list of text values.");
    }
    if (constraints.equipment.length > 8) {
      return invalid("Equipment must include 8 items or fewer.");
    }
    const equipment = constraints.equipment
      .map((item) => cleanText(item).toLowerCase().replace(/\s+/g, "-"))
      .filter(Boolean);
    if (equipment.some((item) => !allowedEquipment.has(item))) {
      return invalid("Equipment includes an unsupported option.");
    }
    normalizedConstraints.equipment = [...new Set(equipment)];
  }

  return {
    ok: true,
    value: {
      ingredientsText,
      craving,
      constraints: normalizedConstraints,
    },
  };
}

async function generateWithOpenAI(recipeRequest, { apiKey, model, fetcher }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetcher(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: createSystemPrompt(),
          },
          {
            role: "user",
            content: JSON.stringify(recipeRequest),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "cookooi_recipe_response",
            schema: recipeResponseSchema(),
            strict: true,
          },
        },
      }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("OpenAI request failed.");
      error.status = response.status;
      error.providerBody = body;
      throw error;
    }

    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("OpenAI request timed out.");
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseProviderJson(providerBody) {
  const candidates = [
    providerBody.output_text,
    providerBody.choices?.[0]?.message?.content,
    ...(providerBody.output || []).flatMap((item) => (item.content || []).map((content) => content.text || content.json)),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (typeof candidate === "object") {
      return candidate;
    }
    if (typeof candidate === "string") {
      try {
        return JSON.parse(candidate);
      } catch {
        // Try the next candidate.
      }
    }
  }

  throw new Error("Provider did not return parseable JSON.");
}

function validateRecipeResponse(payload, request) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.recipes) || payload.recipes.length !== 3) {
    return { ok: false };
  }

  const avoidTerms = splitAvoidTerms(request.constraints.avoid);
  const recipes = [];

  for (const recipe of payload.recipes) {
    const normalized = validateRecipe(recipe, request.constraints);
    if (!normalized) {
      return { ok: false };
    }

    if (recipeSuggestsAvoidedTerm(normalized, avoidTerms)) {
      return { ok: false };
    }
    const searchableText = JSON.stringify(normalized).toLowerCase();
    if (unsafeClaims.some((claim) => searchableText.includes(claim))) {
      return { ok: false };
    }

    recipes.push(normalized);
  }

  return { ok: true, recipes };
}

function validateRecipe(recipe, constraints) {
  if (!recipe || typeof recipe !== "object") {
    return null;
  }

  const title = validString(recipe.title, 90);
  const summary = validString(recipe.summary, 240);
  const confidenceNotes = validString(recipe.confidenceNotes, 300);
  const usesFromAvailableItems = validStringArray(recipe.usesFromAvailableItems, 12, 80);
  const itemsStillNeeded = validStringArray(recipe.itemsStillNeeded, 12, 80);
  const steps = validStringArray(recipe.steps, 7, 240);
  const dietaryNotes = validStringArray(recipe.dietaryNotes, 8, 160);
  const allergyNotes = validStringArray(recipe.allergyNotes, 8, 160);
  const foodSafetyNotes = validStringArray(recipe.foodSafetyNotes, 8, 180);
  const substitutions = validStringArray(recipe.substitutions, 8, 180);
  const prepTimeMinutes = validInteger(recipe.prepTimeMinutes, 0, 240);
  const cookTimeMinutes = validInteger(recipe.cookTimeMinutes, 0, 240);
  const servings = validInteger(recipe.servings, 1, 12);
  const totalTimeMinutes = prepTimeMinutes + cookTimeMinutes;

  if (
    !title ||
    !summary ||
    !confidenceNotes ||
    !usesFromAvailableItems ||
    !itemsStillNeeded ||
    !steps ||
    steps.length < 4 ||
    !dietaryNotes ||
    !allergyNotes ||
    !foodSafetyNotes ||
    !substitutions ||
    prepTimeMinutes === null ||
    cookTimeMinutes === null ||
    servings === null ||
    (constraints.maxTotalTimeMinutes && totalTimeMinutes > constraints.maxTotalTimeMinutes) ||
    !recipeDifficulties.has(recipe.difficulty)
  ) {
    return null;
  }

  return {
    title,
    summary,
    usesFromAvailableItems,
    itemsStillNeeded,
    steps,
    prepTimeMinutes,
    cookTimeMinutes,
    servings: constraints.servings || servings,
    difficulty: recipe.difficulty,
    dietaryNotes,
    allergyNotes,
    foodSafetyNotes,
    substitutions,
    confidenceNotes,
  };
}

function createSystemPrompt() {
  return [
    "You are Cookooi, a food recipe generation service.",
    "Generate exactly three distinct recipe proposals.",
    "Prefer items the user has and keep items still needed practical and short.",
    "Respect avoidances, allergies, diet, available time, servings, and equipment.",
    "Treat avoidances as ingredients the user cannot use and state that cross-contamination cannot be assessed when allergies are provided.",
    "Include practical substitutions and concise food-safety and allergy notes.",
    "Never claim a recipe is allergen-free, medically appropriate, nutritionally guaranteed, or definitely safe.",
    "Return only JSON matching the provided schema. Do not ask follow-up questions.",
  ].join(" ");
}

function recipeResponseSchema() {
  const stringArray = {
    type: "array",
    items: { type: "string" },
  };

  return {
    type: "object",
    additionalProperties: false,
    required: ["recipes"],
    properties: {
      recipes: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "summary",
            "usesFromAvailableItems",
            "itemsStillNeeded",
            "steps",
            "prepTimeMinutes",
            "cookTimeMinutes",
            "servings",
            "difficulty",
            "dietaryNotes",
            "allergyNotes",
            "foodSafetyNotes",
            "substitutions",
            "confidenceNotes",
          ],
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            usesFromAvailableItems: stringArray,
            itemsStillNeeded: stringArray,
            steps: stringArray,
            prepTimeMinutes: { type: "integer" },
            cookTimeMinutes: { type: "integer" },
            servings: { type: "integer" },
            difficulty: { type: "string", enum: ["easy", "medium", "ambitious"] },
            dietaryNotes: stringArray,
            allergyNotes: stringArray,
            foodSafetyNotes: stringArray,
            substitutions: stringArray,
            confidenceNotes: { type: "string" },
          },
        },
      },
    },
  };
}

function createFallbackResponse(request, model, warning) {
  const avoidTerms = splitAvoidTerms(request.constraints.avoid);
  const ingredients = request.ingredientsText
    .split(/[\n,]+|\band\b/gi)
    .map(cleanText)
    .filter(Boolean)
    .filter((ingredient) => !matchesAvoidedTerm(ingredient, avoidTerms))
    .slice(0, 5);
  const used = ingredients.length ? ingredients : ["available items that fit your constraints"];
  const servings = request.constraints.servings || 2;

  return {
    recipes: [
      fallbackRecipe("Quick Available-Ingredient Skillet", request.craving, used, servings, "easy", request.constraints),
      fallbackRecipe("Flexible Cookooi Bowl", request.craving, used, servings, "easy", request.constraints),
      fallbackRecipe("Simple Pantry Plate", request.craving, used, servings, "easy", request.constraints),
    ],
    source: "fallback",
    provider: "fallback",
    model: model || "deterministic-fallback",
    createdAt: new Date().toISOString(),
    warning,
  };
}

function fallbackRecipe(title, craving, used, servings, difficulty, constraints) {
  const totalTime = constraints.maxTotalTimeMinutes || 25;
  const prepTimeMinutes = Math.min(10, Math.max(5, Math.floor(totalTime / 3)));
  const cookTimeMinutes = Math.max(0, Math.min(15, totalTime - prepTimeMinutes));
  const allergyNotes = constraints.avoid
    ? [`Avoid ${constraints.avoid}; cross-contamination cannot be assessed.`]
    : ["Check labels and avoid known allergens before cooking."];

  return {
    title,
    summary: `A simple fallback idea for a ${craving || "practical"} meal using the items available.`,
    usesFromAvailableItems: used,
    itemsStillNeeded: ["seasoning", "cooking oil"],
    steps: [
      "Review the available items and discard anything that looks or smells unsafe.",
      "Cut larger items into bite-size pieces.",
      "Cook firm ingredients first, then add softer ingredients.",
      "Season gradually and taste before serving.",
    ],
    prepTimeMinutes,
    cookTimeMinutes,
    servings,
    difficulty,
    dietaryNotes: constraints.diet && constraints.diet !== "none" ? [`Requested diet: ${constraints.diet}.`] : [],
    allergyNotes,
    foodSafetyNotes: ["Cook high-risk ingredients thoroughly and reheat leftovers until steaming hot."],
    substitutions: ["Use a similar available vegetable, grain, or protein if one item is missing."],
    confidenceNotes: "Fallback output uses broad cooking guidance because AI generation is unavailable.",
  };
}

function classifyProviderError(error) {
  if (error.status === 429) {
    return {
      status: 429,
      code: "provider_rate_limited",
      message: "Cookooi is getting a lot of recipe requests. Please try again shortly.",
      fallbackWarning: "OpenAI rate limit reached.",
    };
  }
  if (error.status === 504) {
    return {
      status: 504,
      code: "provider_timeout",
      message: "Recipe generation took too long. Please try again.",
      fallbackWarning: "OpenAI timed out.",
    };
  }
  if (error.status && error.status >= 500) {
    return {
      status: 503,
      code: "provider_unavailable",
      message: "Recipe generation is temporarily unavailable. Please try again later.",
      fallbackWarning: "OpenAI is temporarily unavailable.",
    };
  }

  return {
    status: 502,
    code: "provider_error",
    message: "Cookooi could not generate recipes right now. Please try again.",
    fallbackWarning: "OpenAI returned an error.",
  };
}

function isClearlyOffTopic(request) {
  const combined = `${request.ingredientsText} ${request.craving}`.toLowerCase();
  const hasFood = foodSignals.some((signal) => combined.includes(signal));
  const hasNonFood = nonFoodSignals.some((signal) => new RegExp(`\\b${signal}\\b`, "i").test(combined));
  return hasNonFood && !hasFood;
}

function splitAvoidTerms(value = "") {
  return value
    .toLowerCase()
    .split(/[\n,;]+|\band\b|\bor\b/gi)
    .map((term) => term.trim())
    .filter(Boolean);
}

function recipeSuggestsAvoidedTerm(recipe, avoidTerms) {
  if (!avoidTerms.length) {
    return false;
  }

  const searchableText = JSON.stringify({
    title: recipe.title,
    summary: recipe.summary,
    usesFromAvailableItems: recipe.usesFromAvailableItems,
    itemsStillNeeded: recipe.itemsStillNeeded,
    steps: recipe.steps,
    substitutions: recipe.substitutions,
    confidenceNotes: recipe.confidenceNotes,
  }).toLowerCase();

  return avoidTerms.some((term) => term && searchableText.includes(term));
}

function matchesAvoidedTerm(value, avoidTerms) {
  const normalizedValue = value.toLowerCase();
  return avoidTerms.some((term) => {
    const normalizedTerm = term.toLowerCase();
    const variants = normalizedTerm.endsWith("s") ? [normalizedTerm, normalizedTerm.slice(0, -1)] : [normalizedTerm];
    return variants.some((variant) => variant && normalizedValue.includes(variant));
  });
}

function validString(value, maxLength) {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = cleanText(value);
  return cleaned && cleaned.length <= maxLength ? cleaned : null;
}

function validStringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return value.map((item) => cleanText(item)).filter((item) => item && item.length <= maxLength);
}

function validInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function invalid(message) {
  return { ok: false, message };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
