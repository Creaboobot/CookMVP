import { createDataServices, safelyRecordDataService } from "./data-services.mjs";
import { createRequestContext } from "./request-context.mjs";

const MAX_BODY_BYTES = 20_000;
const MAX_INGREDIENTS_TEXT_CHARS = 1000;
const MAX_CRAVING_CHARS = 200;
const MAX_AVOID_CHARS = 500;
const MAX_CUISINE_OR_FLAVOR_CHARS = 120;
const MAX_PREVIOUS_RECIPE_TITLES = 12;
const MAX_PREVIOUS_RECIPE_TITLE_CHARS = 90;
const MAX_USER_PROMPT_CHARS = 1600;
const MAX_REFINEMENT_QUESTION_CHARS = 500;
const MAX_REFINEMENT_PROMPT_CHARS = 5000;
const MAX_TRANSCRIPTION_AUDIO_BYTES = 4_000_000;
const MAX_TRANSCRIPTION_REQUEST_BYTES = MAX_TRANSCRIPTION_AUDIO_BYTES + 100_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 20;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const requestRateBuckets = new Map();

const allowedDiets = new Set(["none", "vegetarian", "vegan", "gluten-free", "dairy-free", "halal", "kosher", "other"]);
const allowedEquipment = new Set(["oven", "stovetop", "microwave", "blender", "air-fryer"]);
const allowedMealTypes = new Set(["flexible", "breakfast", "lunch", "dinner", "snack"]);
const supportedAudioMimeTypes = new Set([
  "audio/flac",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/mpeg",
  "audio/mpga",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);
const supportedAudioExtensions = new Set(["flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "ogg", "wav", "webm"]);
const mimeExtensionMap = new Map([
  ["audio/flac", "flac"],
  ["audio/mp3", "mp3"],
  ["audio/mp4", "mp4"],
  ["audio/m4a", "m4a"],
  ["audio/mpeg", "mp3"],
  ["audio/mpga", "mpga"],
  ["audio/ogg", "ogg"],
  ["audio/wav", "wav"],
  ["audio/webm", "webm"],
  ["audio/x-m4a", "m4a"],
  ["audio/x-wav", "wav"],
]);
const allowedConstraintFields = new Set([
  "avoid",
  "diet",
  "servings",
  "maxTotalTimeMinutes",
  "cuisineOrFlavor",
  "equipment",
  "mealType",
]);
const recipeDifficulties = new Set(["easy", "medium", "ambitious"]);
const refinementFeasibilities = new Set(["works", "use_caution", "not_recommended"]);
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
  "bacon",
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
  "greens",
  "kale",
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
  "medically safe",
  "nutrition plan",
  "nutritionally guaranteed",
  "treat diabetes",
  "weight loss",
];
const unsafeRefinementSignals = [
  "allergen-free",
  "allergen free",
  "definitely safe",
  "guarantee",
  "guaranteed safe",
  "heart condition",
  "medical condition",
  "medically appropriate",
  "medically safe",
  "nutrition plan",
  "treat diabetes",
  "weight loss",
];
const nonFoodRefinementTaskSignals = [
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
];
const fallbackTitleOptions = [
  "Quick Available-Ingredient Skillet",
  "Flexible Cookooi Bowl",
  "Simple Available-Item Plate",
  "Fast Mix-and-Match Meal",
  "Easy Cookooi Meal Bowl",
  "Quick Flexible Meal",
  "Warm Available-Item Bowl",
  "Simple Savory Supper",
  "Easy Available-Item Meal",
  "Quick Savory Plate",
  "Flexible Cookooi Meal",
  "Simple Bright Meal Bowl",
  "Easy Weeknight Cookooi Plate",
  "Quick Comfort Meal",
  "Flexible No-Fuss Dinner",
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
        message: "I only cook up food recipes here. Give me ingredients, and I will get back to the kitchen.",
      },
      400,
    );
  }

  const rateLimit = checkRateLimit(request, env, options);
  if (!rateLimit.ok) {
    return jsonResponse(
      {
        error: "rate_limited",
        message: `Too many recipe requests. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
      },
      429,
      { "retry-after": String(rateLimit.retryAfterSeconds) },
    );
  }

  const runtime = createApiRuntime(request, env, options);
  await safelyRecordDataService(() =>
    runtime.dataServices.recipeRequests.recordRecipeRequest(runtime.context, recipeRequest, {
      endpoint: "generate",
      source: "api",
    }),
  );

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

export async function handleRefineRecipeRequest(request, env = {}, options = {}) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed", message: "Use POST to refine a Cookooi recipe." }, 405, {
      allow: "POST",
    });
  }

  let payload;
  try {
    payload = await parseJsonRequest(request);
  } catch (error) {
    return jsonResponse({ error: "invalid_json", message: error.message }, 400);
  }

  const validation = validateRefinementRequest(payload);
  if (!validation.ok) {
    return jsonResponse({ error: "invalid_request", message: validation.message }, 400);
  }

  const refinementRequest = validation.value;
  if (isClearlyOffTopicRefinement(refinementRequest)) {
    return jsonResponse(
      {
        error: "food_only",
        message: "I can only help refine food recipes here. Ask about changing this meal, and I will keep it in the kitchen.",
      },
      400,
    );
  }

  if (isUnsafeRefinementQuestion(refinementRequest.question)) {
    return jsonResponse(
      {
        error: "unsafe_request",
        message: "Cookooi cannot guarantee allergy, medical, or nutrition safety. Ask for a practical cooking change instead.",
      },
      400,
    );
  }

  const rateLimit = checkRateLimit(request, env, options);
  if (!rateLimit.ok) {
    return jsonResponse(
      {
        error: "rate_limited",
        message: `Too many recipe requests. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
      },
      429,
      { "retry-after": String(rateLimit.retryAfterSeconds) },
    );
  }

  const runtime = createApiRuntime(request, env, options);
  await safelyRecordDataService(() =>
    runtime.dataServices.followUpRequests.recordFollowUpRequest(runtime.context, refinementRequest, {
      endpoint: "refine",
      source: "api",
    }),
  );

  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL || DEFAULT_MODEL;
  const fallbackEnabled = env.COOKOOI_ENABLE_FALLBACK === "true";

  if (!apiKey) {
    if (fallbackEnabled) {
      return jsonResponse(
        createFallbackRefinementResponse(refinementRequest, model, "OpenAI is not configured for this environment."),
        200,
      );
    }

    return jsonResponse(
      { error: "provider_unavailable", message: "Recipe refinement is not configured yet. Please try again later." },
      503,
    );
  }

  try {
    const aiResponse = await generateRefinementWithOpenAI(refinementRequest, {
      apiKey,
      model,
      fetcher: options.fetcher || fetch,
    });
    const parsed = parseProviderJson(aiResponse);
    const validationResult = validateRefinementResponse(parsed, refinementRequest);

    if (!validationResult.ok) {
      if (fallbackEnabled) {
        return jsonResponse(
          createFallbackRefinementResponse(refinementRequest, model, "AI refinement output could not be validated."),
          200,
        );
      }

      return jsonResponse({ error: "invalid_ai_output", message: "Cookooi could not validate the refinement response." }, 502);
    }

    return jsonResponse({
      refinement: validationResult.refinement,
      source: "ai",
      provider: "openai",
      model,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const providerError = classifyProviderError(error);

    if (fallbackEnabled && providerError.status !== 429) {
      return jsonResponse(createFallbackRefinementResponse(refinementRequest, model, providerError.fallbackWarning), 200);
    }

    return jsonResponse({ error: providerError.code, message: providerError.message }, providerError.status);
  }
}

export async function handleTranscribeVoiceRequest(request, env = {}, options = {}) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed", message: "Use POST to transcribe a Cookooi voice note." }, 405, {
      allow: "POST",
    });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse({ error: "invalid_request", message: "Upload voice note audio as multipart form data." }, 400);
  }

  const contentLength = positiveHeaderInteger(request.headers.get("content-length"));
  if (contentLength && contentLength > MAX_TRANSCRIPTION_REQUEST_BYTES) {
    return jsonResponse(
      {
        error: "audio_too_large",
        message: "Record a shorter voice note and upload audio of 4 MB or less.",
      },
      413,
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ error: "invalid_request", message: "Cookooi could not read the uploaded audio." }, 400);
  }

  const validation = validateTranscriptionUpload(formData);
  if (!validation.ok) {
    return jsonResponse({ error: validation.error, message: validation.message }, validation.status);
  }

  const rateLimit = checkRateLimit(request, env, options);
  if (!rateLimit.ok) {
    return jsonResponse(
      {
        error: "rate_limited",
        message: `Too many voice transcription requests. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
      },
      429,
      { "retry-after": String(rateLimit.retryAfterSeconds) },
    );
  }

  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL;
  if (!apiKey) {
    return jsonResponse(
      {
        error: "provider_unavailable",
        message: "Voice transcription is not configured yet. Use the text transcript field for now.",
      },
      503,
    );
  }

  try {
    const providerBody = await transcribeWithOpenAI(validation.value, {
      apiKey,
      model,
      fetcher: options.fetcher || fetch,
    });
    const transcript = cleanText(providerBody.text);
    if (!transcript) {
      return jsonResponse({ error: "invalid_ai_output", message: "Cookooi could not read a transcript from this audio." }, 502);
    }

    const runtime = createApiRuntime(request, env, options);
    await safelyRecordDataService(() =>
      runtime.dataServices.voiceNotes.recordTranscriptionMetadata(runtime.context, {
        provider: "openai",
        model,
        source: "api",
        audioBytes: validation.value.file.size,
        mimeType: validation.value.mimeType,
      }),
    );

    return jsonResponse({
      transcript,
      source: "ai",
      provider: "openai",
      model,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const providerError = classifyTranscriptionProviderError(error);
    return jsonResponse({ error: providerError.code, message: providerError.message }, providerError.status);
  }
}

function createApiRuntime(request, env, options = {}) {
  const context = options.requestContext || createRequestContext(request, env, { now: options.now });
  const dataServices = options.dataServices || createDataServices({ env, adapters: options.dataAdapters });

  return { context, dataServices };
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
  if (ingredientsText.length > MAX_INGREDIENTS_TEXT_CHARS) {
    return invalid(`Ingredients text must be ${MAX_INGREDIENTS_TEXT_CHARS} characters or fewer.`);
  }

  if (payload.craving !== undefined && typeof payload.craving !== "string") {
    return invalid("Craving must be text when provided.");
  }
  const submittedCraving = cleanText(payload.craving);
  if (submittedCraving.length > MAX_CRAVING_CHARS) {
    return invalid(`Craving must be ${MAX_CRAVING_CHARS} characters or fewer.`);
  }
  const craving = submittedCraving || "flexible meal ideas";

  const previousTitles = normalizePreviousRecipeTitles(payload.previousRecipeTitles);
  if (!previousTitles.ok) {
    return previousTitles;
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
    if (normalizedConstraints.avoid.length > MAX_AVOID_CHARS) {
      return invalid(`Avoidances must be ${MAX_AVOID_CHARS} characters or fewer.`);
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
    if (normalizedConstraints.cuisineOrFlavor.length > MAX_CUISINE_OR_FLAVOR_CHARS) {
      return invalid(`Cuisine or flavor must be ${MAX_CUISINE_OR_FLAVOR_CHARS} characters or fewer.`);
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

  if (constraints.mealType !== undefined) {
    if (typeof constraints.mealType !== "string" || !allowedMealTypes.has(constraints.mealType)) {
      return invalid("Meal type must be one of the supported meal type options.");
    }
    normalizedConstraints.mealType = constraints.mealType;
  }

  const promptCharacters = countUserPromptCharacters({
    ingredientsText,
    craving,
    constraints: normalizedConstraints,
  });
  if (promptCharacters > MAX_USER_PROMPT_CHARS) {
    return invalid(
      `Your request is too long for this test build. Shorten available items, optional craving, or preferences to ${MAX_USER_PROMPT_CHARS} characters total.`,
    );
  }

  return {
    ok: true,
    value: {
      ingredientsText,
      craving,
      previousRecipeTitles: previousTitles.value,
      constraints: normalizedConstraints,
    },
  };
}

function validateRefinementRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return invalid("Request body must be a JSON object.");
  }

  const recipe = validateRecipe(payload.recipe, {});
  if (!recipe) {
    return invalid("Provide a complete selected recipe to refine.");
  }

  if (payload.question !== undefined && typeof payload.question !== "string") {
    return invalid("Follow-up question must be text.");
  }
  const question = cleanText(payload.question);
  if (!question) {
    return invalid("Add a question or requested change for this recipe.");
  }
  if (question.length > MAX_REFINEMENT_QUESTION_CHARS) {
    return invalid(`Follow-up question must be ${MAX_REFINEMENT_QUESTION_CHARS} characters or fewer.`);
  }

  const generation = normalizeGenerationMetadata(payload.generation);
  if (!generation.ok) {
    return generation;
  }

  const promptCharacters = JSON.stringify({ recipe, question, generation: generation.value }).length;
  if (promptCharacters > MAX_REFINEMENT_PROMPT_CHARS) {
    return invalid("This recipe follow-up is too large for this test build. Shorten the selected recipe or question.");
  }

  return {
    ok: true,
    value: {
      recipe,
      question,
      generation: generation.value,
    },
  };
}

function normalizeGenerationMetadata(value) {
  if (value === undefined) {
    return { ok: true, value: {} };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid("Generation metadata must be an object when provided.");
  }

  const metadata = {};
  for (const field of ["source", "provider", "model", "createdAt"]) {
    if (value[field] !== undefined) {
      if (typeof value[field] !== "string") {
        return invalid(`Generation metadata ${field} must be text.`);
      }
      const cleaned = cleanText(value[field]);
      if (cleaned.length > 120) {
        return invalid(`Generation metadata ${field} is too long.`);
      }
      if (cleaned) {
        metadata[field] = cleaned;
      }
    }
  }

  return { ok: true, value: metadata };
}

function normalizePreviousRecipeTitles(value) {
  if (value === undefined) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(value)) {
    return invalid("Previous recipe titles must be a list when provided.");
  }
  if (value.length > MAX_PREVIOUS_RECIPE_TITLES) {
    return invalid(`Previous recipe titles must include ${MAX_PREVIOUS_RECIPE_TITLES} items or fewer.`);
  }
  if (value.some((title) => typeof title !== "string")) {
    return invalid("Previous recipe titles must be text.");
  }

  const titles = [...new Set(value.map(cleanText).filter(Boolean))];
  if (titles.some((title) => title.length > MAX_PREVIOUS_RECIPE_TITLE_CHARS)) {
    return invalid(`Previous recipe titles must be ${MAX_PREVIOUS_RECIPE_TITLE_CHARS} characters or fewer.`);
  }

  return { ok: true, value: titles };
}

function validateTranscriptionUpload(formData) {
  const audioFile = formData.get("audio") || formData.get("file");
  if (!isUploadedFile(audioFile)) {
    return invalidUpload("missing_audio", "Upload one short voice note audio file.", 400);
  }

  if (audioFile.size <= 0) {
    return invalidUpload("missing_audio", "Upload one non-empty voice note audio file.", 400);
  }

  if (audioFile.size > MAX_TRANSCRIPTION_AUDIO_BYTES) {
    return invalidUpload("audio_too_large", "Record a shorter voice note and upload audio of 4 MB or less.", 413);
  }

  const mimeType = normalizedAudioMimeType(audioFile);
  const extension = extensionForAudioFile(audioFile);
  if (!supportedAudioMimeTypes.has(mimeType) && !supportedAudioExtensions.has(extension)) {
    return invalidUpload(
      "unsupported_audio_type",
      "Upload a supported audio file such as m4a, mp4, webm, wav, mp3, ogg, or flac.",
      415,
    );
  }

  return {
    ok: true,
    value: {
      file: audioFile,
      mimeType,
      filename: filenameForAudioUpload(audioFile, mimeType, extension),
    },
  };
}

function checkRateLimit(request, env = {}, options = {}) {
  const maxRequests = positiveConfigInteger(env.COOKOOI_RATE_LIMIT_MAX_REQUESTS, DEFAULT_RATE_LIMIT_MAX_REQUESTS);
  const windowMs = positiveConfigInteger(env.COOKOOI_RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS);
  if (!maxRequests || !windowMs) {
    return { ok: true };
  }

  const now = typeof options.now === "function" ? options.now() : Date.now();
  const store = options.rateLimitStore || requestRateBuckets;
  const key = rateLimitKey(request);
  const current = store.get(key);
  const bucket = current && current.expiresAt > now ? current : { count: 0, expiresAt: now + windowMs };

  if (bucket.count >= maxRequests) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  store.set(key, bucket);

  if (store.size > 1000) {
    for (const [bucketKey, value] of store) {
      if (value.expiresAt <= now) {
        store.delete(bucketKey);
      }
    }
  }

  return { ok: true };
}

function rateLimitKey(request) {
  const sessionId = cleanText(request.headers.get("x-cookooi-session"));
  if (sessionId) {
    return `session:${sessionId.slice(0, 80)}`;
  }

  const forwardedIp = cleanText(request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  return forwardedIp ? `ip:${forwardedIp}` : "anonymous";
}

function countUserPromptCharacters(request) {
  return [
    request.ingredientsText,
    request.craving,
    request.constraints.avoid,
    request.constraints.diet,
    String(request.constraints.servings || ""),
    String(request.constraints.maxTotalTimeMinutes || ""),
    request.constraints.cuisineOrFlavor,
    request.constraints.mealType,
    ...(request.constraints.equipment || []),
  ]
    .filter(Boolean)
    .join(" ")
    .length;
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

async function generateRefinementWithOpenAI(refinementRequest, { apiKey, model, fetcher }) {
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
            content: createRefinementSystemPrompt(),
          },
          {
            role: "user",
            content: JSON.stringify(refinementRequest),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "cookooi_recipe_refinement_response",
            schema: refinementResponseSchema(),
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

async function transcribeWithOpenAI(upload, { apiKey, model, fetcher }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const body = new FormData();
  body.set("file", upload.file, upload.filename);
  body.set("model", model);
  body.set("response_format", "json");
  body.set("prompt", "Short Cookooi cooking voice note with ingredients available, optional craving, and practical constraints.");

  try {
    const response = await fetcher(OPENAI_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: controller.signal,
    });

    const providerBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("OpenAI transcription request failed.");
      error.status = response.status;
      error.providerBody = providerBody;
      throw error;
    }

    return providerBody;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("OpenAI transcription request timed out.");
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
  const previousTitles = new Set((request.previousRecipeTitles || []).map(comparableTitle));
  const seenTitles = new Set();
  const recipes = [];

  for (const recipe of payload.recipes) {
    const normalized = validateRecipe(recipe, request.constraints);
    if (!normalized) {
      return { ok: false };
    }

    const normalizedTitle = comparableTitle(normalized.title);
    if (!normalizedTitle || previousTitles.has(normalizedTitle) || seenTitles.has(normalizedTitle)) {
      return { ok: false };
    }
    seenTitles.add(normalizedTitle);

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

function validateRefinementResponse(payload, request) {
  if (!payload || typeof payload !== "object" || !payload.refinement || typeof payload.refinement !== "object") {
    return { ok: false };
  }

  const refinement = payload.refinement;
  const feasibility = refinement.feasibility;
  const explanation = validString(refinement.explanation, 800);
  const modifiedIngredients = validStringArray(refinement.modifiedIngredients, 12, 120);
  const modifiedSteps = validStringArray(refinement.modifiedSteps, 8, 240);
  const allergyNotes = validStringArray(refinement.allergyNotes, 8, 180);
  const foodSafetyNotes = validStringArray(refinement.foodSafetyNotes, 8, 180);
  const confidenceNotes = validString(refinement.confidenceNotes, 300);
  const proposedVariant =
    refinement.proposedVariant && typeof refinement.proposedVariant === "object"
      ? validateRecipe(refinement.proposedVariant, {})
      : null;

  if (
    !refinementFeasibilities.has(feasibility) ||
    !explanation ||
    !modifiedIngredients ||
    !modifiedSteps ||
    !allergyNotes ||
    !foodSafetyNotes ||
    foodSafetyNotes.length < 1 ||
    (request.recipe.allergyNotes.length > 0 && allergyNotes.length < 1) ||
    !confidenceNotes
  ) {
    return { ok: false };
  }

  if (refinement.proposedVariant && !proposedVariant) {
    return { ok: false };
  }

  const searchableText = JSON.stringify({
    feasibility,
    explanation,
    modifiedIngredients,
    modifiedSteps,
    allergyNotes,
    foodSafetyNotes,
    confidenceNotes,
    proposedVariant,
  }).toLowerCase();
  if (unsafeClaims.some((claim) => searchableText.includes(claim))) {
    return { ok: false };
  }

  return {
    ok: true,
    refinement: {
      feasibility,
      explanation,
      modifiedIngredients,
      modifiedSteps,
      allergyNotes,
      foodSafetyNotes,
      confidenceNotes,
      proposedVariant,
    },
  };
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
    "Respect avoidances, allergies, diet, meal type, available time, servings, and equipment.",
    "When previousRecipeTitles are provided, avoid those exact titles and generate meaningfully different alternatives.",
    "Treat avoidances as ingredients the user cannot use and state that cross-contamination cannot be assessed when allergies are provided.",
    "Include practical substitutions and concise food-safety and allergy notes.",
    "Never claim a recipe is allergen-free, medically appropriate, nutritionally guaranteed, or definitely safe.",
    "Return only JSON matching the provided schema. Do not ask follow-up questions.",
  ].join(" ");
}

function createRefinementSystemPrompt() {
  return [
    "You are Cookooi, a food recipe refinement service.",
    "Evaluate one selected recipe plus one bounded user follow-up question.",
    "Return feasibility, a concise explanation, suggested ingredient changes, suggested step changes, allergy notes, food-safety notes, confidence notes, and an optional proposed variant.",
    "Do not overwrite the original recipe; proposedVariant is only a suggestion for UI display.",
    "Preserve allergy and food-safety caution language from the selected recipe.",
    "Never claim a recipe is allergen-free, medically appropriate, nutritionally guaranteed, definitely safe, or guaranteed safe.",
    "Reject non-food or unsafe requests through the structured response by using not_recommended and safe notes.",
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

function refinementResponseSchema() {
  const stringArray = {
    type: "array",
    items: { type: "string" },
  };
  const recipeSchema = recipeObjectSchema(stringArray);

  return {
    type: "object",
    additionalProperties: false,
    required: ["refinement"],
    properties: {
      refinement: {
        type: "object",
        additionalProperties: false,
        required: [
          "feasibility",
          "explanation",
          "modifiedIngredients",
          "modifiedSteps",
          "allergyNotes",
          "foodSafetyNotes",
          "confidenceNotes",
          "proposedVariant",
        ],
        properties: {
          feasibility: { type: "string", enum: ["works", "use_caution", "not_recommended"] },
          explanation: { type: "string" },
          modifiedIngredients: stringArray,
          modifiedSteps: stringArray,
          allergyNotes: stringArray,
          foodSafetyNotes: stringArray,
          confidenceNotes: { type: "string" },
          proposedVariant: {
            anyOf: [recipeSchema, { type: "null" }],
          },
        },
      },
    },
  };
}

function recipeObjectSchema(stringArray) {
  return {
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
  const titles = fallbackTitles(request.previousRecipeTitles);

  return {
    recipes: titles.map((title) => fallbackRecipe(title, request.craving, used, servings, "easy", request.constraints)),
    source: "fallback",
    provider: "fallback",
    model: model || "deterministic-fallback",
    createdAt: new Date().toISOString(),
    warning,
  };
}

function createFallbackRefinementResponse(request, model, warning) {
  return {
    refinement: fallbackRefinement(request),
    source: "fallback",
    provider: "fallback",
    model: model || "deterministic-fallback",
    createdAt: new Date().toISOString(),
    warning,
  };
}

function fallbackRefinement(request) {
  const question = request.question.toLowerCase();
  const wantsGreens = /\b(greens?|kale|spinach|chard|arugula)\b/i.test(question);
  const addedItem = wantsGreens ? "leafy greens" : "the requested ingredient";
  const original = request.recipe;
  const proposedVariant = {
    ...original,
    title: original.title.includes("With") ? original.title : `${original.title} With ${wantsGreens ? "Greens" : "A Small Change"}`.slice(0, 90),
    summary: `${original.summary} Add ${addedItem} only if it looks fresh and fits the flavor.`.slice(0, 240),
    usesFromAvailableItems: uniqueStrings([...original.usesFromAvailableItems, addedItem]).slice(0, 12),
    steps: [
      ...original.steps.slice(0, Math.max(0, original.steps.length - 1)),
      `Add ${addedItem} near the end so it softens without overcooking.`,
      original.steps.at(-1) || "Taste and adjust seasoning before serving.",
    ].slice(0, 7),
    foodSafetyNotes: uniqueStrings([
      ...original.foodSafetyNotes,
      "Wash added produce well and discard anything spoiled, slimy, or off-smelling.",
    ]).slice(0, 8),
    allergyNotes: uniqueStrings([
      ...original.allergyNotes,
      "Check labels and cross-contact risk for any added item; Cookooi cannot certify allergy safety.",
    ]).slice(0, 8),
    confidenceNotes: "Fallback refinement uses conservative cooking guidance because AI refinement is unavailable.",
  };

  return {
    feasibility: "use_caution",
    explanation: `This change can work if the added ${addedItem} is fresh, compatible with the existing flavors, and added in a small amount first.`,
    modifiedIngredients: [`Add a small handful of ${addedItem}.`],
    modifiedSteps: [`Stir in ${addedItem} near the end of cooking, then taste before adding more.`],
    allergyNotes: proposedVariant.allergyNotes,
    foodSafetyNotes: proposedVariant.foodSafetyNotes,
    confidenceNotes: "Fallback refinement gives general guidance and does not replace user review of freshness, allergies, or cooking safety.",
    proposedVariant,
  };
}

function fallbackTitles(previousRecipeTitles = []) {
  const previous = new Set(previousRecipeTitles.map(comparableTitle));
  const selected = [];

  for (const title of fallbackTitleOptions) {
    const normalized = comparableTitle(title);
    if (!previous.has(normalized) && !selected.some((selectedTitle) => comparableTitle(selectedTitle) === normalized)) {
      selected.push(title);
    }
    if (selected.length === 3) {
      return selected;
    }
  }

  for (let index = 1; selected.length < 3; index += 1) {
    const title = `Flexible Cookooi Meal Idea ${index}`;
    if (!previous.has(comparableTitle(title))) {
      selected.push(title);
    }
  }

  return selected;
}

function fallbackRecipe(title, craving, used, servings, difficulty, constraints) {
  const totalTime = constraints.maxTotalTimeMinutes || 25;
  const prepTimeMinutes = Math.min(10, Math.max(5, Math.floor(totalTime / 3)));
  const cookTimeMinutes = Math.max(0, Math.min(15, totalTime - prepTimeMinutes));
  const allergyNotes = constraints.avoid
    ? [`Avoid ${constraints.avoid}; cross-contamination cannot be assessed.`]
    : ["Check labels and avoid known allergens before cooking."];
  const dietaryNotes = [
    constraints.diet && constraints.diet !== "none" ? `Requested diet: ${constraints.diet}.` : "",
    constraints.mealType && constraints.mealType !== "flexible" ? `Meal type: ${constraints.mealType}.` : "",
  ].filter(Boolean);

  return {
    title,
    summary: `A simple fallback idea for ${craving || "flexible meal ideas"} using the items available.`,
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
    dietaryNotes,
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

function classifyTranscriptionProviderError(error) {
  if (error.status === 429) {
    return {
      status: 429,
      code: "provider_rate_limited",
      message: "Cookooi is getting a lot of voice transcription requests. Please try again shortly.",
    };
  }
  if (error.status === 504) {
    return {
      status: 504,
      code: "provider_timeout",
      message: "Voice transcription took too long. Please try again with a shorter note.",
    };
  }
  if (error.status && error.status >= 500) {
    return {
      status: 503,
      code: "provider_unavailable",
      message: "Voice transcription is temporarily unavailable. Use the text transcript field or try again later.",
    };
  }

  return {
    status: 502,
    code: "provider_error",
    message: "Cookooi could not transcribe this voice note right now. Use the text transcript field or try again.",
  };
}

function isClearlyOffTopic(request) {
  const combined = `${request.ingredientsText} ${request.craving}`.toLowerCase();
  const hasFood = foodSignals.some((signal) => combined.includes(signal));
  const hasNonFood = nonFoodSignals.some((signal) => new RegExp(`\\b${signal}\\b`, "i").test(combined));
  return hasNonFood && !hasFood;
}

function isClearlyOffTopicRefinement(request) {
  const question = request.question.toLowerCase();
  const hasFood = foodSignals.some((signal) => question.includes(signal));
  const hasNonFood = nonFoodSignals.some((signal) => new RegExp(`\\b${signal}\\b`, "i").test(question));
  const asksForNonFoodTask = nonFoodRefinementTaskSignals.some((signal) => new RegExp(`\\b${signal}\\b`, "i").test(question));
  return asksForNonFoodTask || (hasNonFood && !hasFood);
}

function isUnsafeRefinementQuestion(question) {
  const normalized = question.toLowerCase();
  return unsafeRefinementSignals.some((signal) => normalized.includes(signal));
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

function comparableTitle(value) {
  return cleanText(value).toLowerCase();
}

function uniqueStrings(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
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
  const cleaned = value.map((item) => cleanText(item));
  return cleaned.every((item) => item && item.length <= maxLength) ? cleaned : null;
}

function validInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function positiveConfigInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isUploadedFile(value) {
  return value && typeof value !== "string" && typeof value.arrayBuffer === "function" && Number.isFinite(value.size);
}

function normalizedAudioMimeType(file) {
  return cleanText(file.type).toLowerCase().split(";")[0];
}

function extensionForAudioFile(file) {
  const name = typeof file.name === "string" ? file.name : "";
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

function filenameForAudioUpload(file, mimeType, extension) {
  const sourceName = typeof file.name === "string" ? file.name : "";
  if (sourceName && supportedAudioExtensions.has(extension)) {
    return sourceName;
  }
  const fallbackExtension = mimeExtensionMap.get(mimeType) || extension || "webm";
  return `cookooi-voice-note.${fallbackExtension}`;
}

function positiveHeaderInteger(value) {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function invalidUpload(error, message, status) {
  return { ok: false, error, message, status };
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
