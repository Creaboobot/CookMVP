import test from "node:test";
import assert from "node:assert/strict";
import { handleGenerateRecipeRequest, handleRefineRecipeRequest, handleTranscribeVoiceRequest } from "../src/recipe-api.mjs";

test("rejects non-POST requests", async () => {
  const response = await handleGenerateRecipeRequest(new Request("http://cookooi.test/api/recipes/generate"));

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("rejects malformed JSON", async () => {
  const response = await handleGenerateRecipeRequest(
    new Request("http://cookooi.test/api/recipes/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_json");
});

test("rejects invalid payloads with missing ingredients", async () => {
  const response = await handleGenerateRecipeRequest(
    new Request("http://cookooi.test/api/recipes/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ craving: "quick dinner" }),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_request");
  assert.match(body.message, /ingredients/i);
  assert.doesNotMatch(body.message, /craving/i);
});

test("rejects overlong available item input", async () => {
  const response = await handleGenerateRecipeRequest(validRequest({ ingredientsText: "rice ".repeat(260) }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_request");
  assert.match(body.message, /1000 characters or fewer/);
});

test("rejects requests that exceed the prompt budget", async () => {
  const response = await handleGenerateRecipeRequest(
    validRequest({
      ingredientsText: "rice ".repeat(200),
      craving: "d".repeat(200),
      constraints: {
        avoid: "p".repeat(500),
        cuisineOrFlavor: "c".repeat(120),
      },
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_request");
  assert.match(body.message, /too long/i);
  assert.match(body.message, /shorten/i);
});

test("allows regeneration hints when the base request fits the prompt budget", async () => {
  const response = await handleGenerateRecipeRequest(
    validRequest({
      ingredientsText: "rice ".repeat(190).trim(),
      craving: "d".repeat(200),
      constraints: {
        avoid: "p".repeat(430),
      },
      previousRecipeTitles: ["a".repeat(90), "b".repeat(90), "c".repeat(90)],
    }),
    { COOKOOI_ENABLE_FALLBACK: "true" },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.source, "fallback");
  assert.equal(body.recipes.length, 3);
});

test("returns food-only response for clearly off-topic requests", async () => {
  const response = await handleGenerateRecipeRequest(
    new Request("http://cookooi.test/api/recipes/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ingredientsText: "laptop, compiler", craving: "debug javascript" }),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "food_only");
});

test("returns 503 when OpenAI configuration is missing", async () => {
  const response = await handleGenerateRecipeRequest(validRequest());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error, "provider_unavailable");
});

test("maps provider errors to user-safe responses", async () => {
  const response = await handleGenerateRecipeRequest(
    validRequest(),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async () =>
        new Response(JSON.stringify({ error: { message: "secret provider detail" } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 429);
  assert.equal(body.error, "provider_rate_limited");
  assert.match(body.message, /try again/i);
  assert.doesNotMatch(JSON.stringify(body), /secret provider detail/);
});

test("returns fallback recipes when craving is empty", async () => {
  const response = await handleGenerateRecipeRequest(validRequest({ craving: "" }), {
    COOKOOI_ENABLE_FALLBACK: "true",
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.source, "fallback");
  assert.equal(body.recipes.length, 3);
  for (const fallbackRecipe of body.recipes) {
    assert.match(fallbackRecipe.summary, /flexible meal ideas/);
    assert.doesNotMatch(fallbackRecipe.summary, /\s{2,}|undefined|null/);
  }
});

test("maps provider timeouts to retryable user-safe responses", async () => {
  const response = await handleGenerateRecipeRequest(
    validRequest(),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      },
    },
  );
  const body = await response.json();

  assert.equal(response.status, 504);
  assert.equal(body.error, "provider_timeout");
  assert.match(body.message, /try again/i);
});

test("returns fallback refinement for a valid per-meal follow-up", async () => {
  const response = await handleRefineRecipeRequest(refineRequest(), { COOKOOI_ENABLE_FALLBACK: "true" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.source, "fallback");
  assert.equal(body.refinement.feasibility, "use_caution");
  assert.match(body.refinement.explanation, /leafy greens/i);
  assert.match(body.refinement.foodSafetyNotes.join(" "), /discard anything spoiled/i);
  assert.match(body.refinement.allergyNotes.join(" "), /cannot certify allergy safety/i);
  assert.equal(body.refinement.proposedVariant.title, "Potato Bacon Soup With Greens");
});

test("rejects invalid refinement payloads", async () => {
  const response = await handleRefineRecipeRequest(
    refineRequest({
      question: "a".repeat(501),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_request");
  assert.match(body.message, /500 characters or fewer/);
});

test("rejects unrelated or unsafe refinement questions", async () => {
  const unrelated = await handleRefineRecipeRequest(refineRequest({ question: "Write javascript for this card." }));
  const unrelatedBody = await unrelated.json();

  assert.equal(unrelated.status, 400);
  assert.equal(unrelatedBody.error, "food_only");

  const unrelatedWithFoodWords = await handleRefineRecipeRequest(
    refineRequest({ question: "Write javascript code for this potato soup recipe." }),
  );
  const unrelatedWithFoodWordsBody = await unrelatedWithFoodWords.json();

  assert.equal(unrelatedWithFoodWords.status, 400);
  assert.equal(unrelatedWithFoodWordsBody.error, "food_only");

  const unsafe = await handleRefineRecipeRequest(refineRequest({ question: "Can you guarantee this is allergen-free?" }));
  const unsafeBody = await unsafe.json();

  assert.equal(unsafe.status, 400);
  assert.equal(unsafeBody.error, "unsafe_request");

  const medical = await handleRefineRecipeRequest(
    refineRequest({ question: "Can you make this medically appropriate for my heart condition?" }),
  );
  const medicalBody = await medical.json();

  assert.equal(medical.status, 400);
  assert.equal(medicalBody.error, "unsafe_request");
});

test("sends selected recipe and follow-up to the refinement provider", async () => {
  let providerRequest;
  const response = await handleRefineRecipeRequest(
    refineRequest(),
    { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    {
      fetcher: async (_url, init) => {
        providerRequest = JSON.parse(init.body);
        return Response.json({
          output_text: JSON.stringify({
            refinement: refinement(),
          }),
        });
      },
    },
  );
  const body = await response.json();
  const sentRequest = JSON.parse(providerRequest.input[1].content);

  assert.equal(response.status, 200);
  assert.equal(body.source, "ai");
  assert.equal(body.provider, "openai");
  assert.equal(sentRequest.recipe.title, "Potato Bacon Soup");
  assert.match(sentRequest.question, /greens/i);
  assert.equal(body.refinement.proposedVariant.title, "Potato Bacon Soup With Greens");
});

test("rejects unsafe refinement provider output", async () => {
  const response = await handleRefineRecipeRequest(
    refineRequest(),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async () =>
        Response.json({
          output_text: JSON.stringify({
            refinement: {
              ...refinement(),
              explanation: "This is definitely safe and allergen-free.",
            },
          }),
        }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.error, "invalid_ai_output");

  const nutritionResponse = await handleRefineRecipeRequest(
    refineRequest(),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async () =>
        Response.json({
          output_text: JSON.stringify({
            refinement: {
              ...refinement(),
              explanation: "This can be part of a weight loss nutrition plan and help treat diabetes.",
            },
          }),
        }),
    },
  );
  const nutritionBody = await nutritionResponse.json();

  assert.equal(nutritionResponse.status, 502);
  assert.equal(nutritionBody.error, "invalid_ai_output");
});

test("maps refinement provider errors to user-safe responses", async () => {
  const response = await handleRefineRecipeRequest(
    refineRequest(),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async () =>
        new Response(JSON.stringify({ error: { message: "secret provider detail" } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 429);
  assert.equal(body.error, "provider_rate_limited");
  assert.doesNotMatch(JSON.stringify(body), /secret provider detail/);
});

test("maps refinement provider timeouts to retryable user-safe responses", async () => {
  const response = await handleRefineRecipeRequest(
    refineRequest(),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      },
    },
  );
  const body = await response.json();

  assert.equal(response.status, 504);
  assert.equal(body.error, "provider_timeout");
  assert.match(body.message, /try again/i);
});

test("rejects non-POST transcription requests", async () => {
  const response = await handleTranscribeVoiceRequest(new Request("http://cookooi.test/api/voice/transcribe"));
  const body = await response.json();

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.equal(body.error, "method_not_allowed");
});

test("rejects invalid transcription uploads", async () => {
  const wrongContentType = await handleTranscribeVoiceRequest(
    new Request("http://cookooi.test/api/voice/transcribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  const wrongContentTypeBody = await wrongContentType.json();

  assert.equal(wrongContentType.status, 400);
  assert.equal(wrongContentTypeBody.error, "invalid_request");

  const missingAudio = await handleTranscribeVoiceRequest(audioRequest(null));
  const missingAudioBody = await missingAudio.json();

  assert.equal(missingAudio.status, 400);
  assert.equal(missingAudioBody.error, "missing_audio");

  const unsupported = await handleTranscribeVoiceRequest(
    audioRequest(new Blob(["not audio"], { type: "text/plain" }), "voice-note.txt"),
  );
  const unsupportedBody = await unsupported.json();

  assert.equal(unsupported.status, 415);
  assert.equal(unsupportedBody.error, "unsupported_audio_type");
});

test("rejects oversized transcription audio", async () => {
  const oversized = new Blob([new Uint8Array(4_000_001)], { type: "audio/webm" });
  const response = await handleTranscribeVoiceRequest(audioRequest(oversized, "voice-note.webm"));
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.equal(body.error, "audio_too_large");
  assert.match(body.message, /4 MB or less/);
});

test("returns 503 when transcription OpenAI configuration is missing", async () => {
  const response = await handleTranscribeVoiceRequest(audioRequest());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error, "provider_unavailable");
  assert.match(body.message, /text transcript/i);
});

test("sends audio to the transcription provider and returns transcript", async () => {
  let providerUrl;
  let providerRequest;
  const response = await handleTranscribeVoiceRequest(
    audioRequest(),
    { OPENAI_API_KEY: "test-key", OPENAI_TRANSCRIPTION_MODEL: "test-transcribe-model" },
    {
      fetcher: async (url, init) => {
        providerUrl = url;
        providerRequest = init;
        return Response.json({ text: "Eggs, rice, and spinach for dinner." });
      },
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(providerUrl, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(providerRequest.method, "POST");
  assert.equal(providerRequest.headers.authorization, "Bearer test-key");
  assert.equal(providerRequest.body.get("model"), "test-transcribe-model");
  assert.equal(providerRequest.body.get("response_format"), "json");
  assert.equal(providerRequest.body.get("file").name, "voice-note.webm");
  assert.equal(body.transcript, "Eggs, rice, and spinach for dinner.");
  assert.equal(body.source, "ai");
  assert.equal(body.provider, "openai");
  assert.equal(body.model, "test-transcribe-model");
});

test("maps transcription provider errors to user-safe responses", async () => {
  const response = await handleTranscribeVoiceRequest(
    audioRequest(),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async () =>
        new Response(JSON.stringify({ error: { message: "secret provider detail" } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error, "provider_unavailable");
  assert.doesNotMatch(JSON.stringify(body), /secret provider detail/);
});

test("maps transcription provider timeouts to retryable user-safe responses", async () => {
  const response = await handleTranscribeVoiceRequest(
    audioRequest(),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      },
    },
  );
  const body = await response.json();

  assert.equal(response.status, 504);
  assert.equal(body.error, "provider_timeout");
  assert.match(body.message, /shorter note/i);
});

test("rate limits repeated requests from the same test session", async () => {
  const rateLimitStore = new Map();
  const env = {
    COOKOOI_ENABLE_FALLBACK: "true",
    COOKOOI_RATE_LIMIT_MAX_REQUESTS: "2",
    COOKOOI_RATE_LIMIT_WINDOW_MS: "60000",
  };
  const options = { rateLimitStore, now: () => 1000 };

  assert.equal((await handleGenerateRecipeRequest(validRequest({}, { "x-cookooi-session": "test-session" }), env, options)).status, 200);
  assert.equal((await handleGenerateRecipeRequest(validRequest({}, { "x-cookooi-session": "test-session" }), env, options)).status, 200);

  const response = await handleGenerateRecipeRequest(validRequest({}, { "x-cookooi-session": "test-session" }), env, options);
  const body = await response.json();

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(body.error, "rate_limited");
});

test("returns valid structured recipes from provider output", async () => {
  const response = await handleGenerateRecipeRequest(
    validRequest(),
    { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    {
      fetcher: async () =>
        Response.json({
          output_text: JSON.stringify({
            recipes: [recipe("Spinach Rice Skillet"), recipe("Egg Rice Bowl"), recipe("Cheddar Spinach Cups")],
          }),
        }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.source, "ai");
  assert.equal(body.provider, "openai");
  assert.equal(body.model, "test-model");
  assert.equal(body.recipes.length, 3);
  assert.equal(body.recipes[0].servings, 2);
});

test("sends validated user constraints to the provider", async () => {
  let providerRequest;
  const response = await handleGenerateRecipeRequest(
    validRequest({
      constraints: {
        avoid: " peanuts, shellfish ",
        diet: "vegetarian",
        mealType: "dinner",
        servings: 4,
        maxTotalTimeMinutes: 30,
        cuisineOrFlavor: "bright Thai",
        equipment: ["oven", "air fryer", "oven"],
      },
    }),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async (_url, init) => {
        providerRequest = JSON.parse(init.body);
        return Response.json({
          output_text: JSON.stringify({
            recipes: [recipe("Spinach Rice Skillet"), recipe("Egg Rice Bowl"), recipe("Cheddar Spinach Cups")],
          }),
        });
      },
    },
  );
  const body = await response.json();
  const sentRequest = JSON.parse(providerRequest.input[1].content);

  assert.equal(response.status, 200);
  assert.equal(body.recipes[0].servings, 4);
  assert.deepEqual(sentRequest.constraints, {
    servings: 4,
    avoid: "peanuts, shellfish",
    diet: "vegetarian",
    maxTotalTimeMinutes: 30,
    cuisineOrFlavor: "bright Thai",
    equipment: ["oven", "air-fryer"],
    mealType: "dinner",
  });
});

test("rejects provider output that uses avoided ingredients", async () => {
  const response = await handleGenerateRecipeRequest(
    validRequest({ constraints: { avoid: "peanuts" } }),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async () =>
        Response.json({
          output_text: JSON.stringify({
            recipes: [recipe("Peanut Rice Bowl", ["peanuts"]), recipe("Egg Rice Bowl"), recipe("Cheddar Spinach Cups")],
          }),
        }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.error, "invalid_ai_output");
});

test("sends neutral generation goal to the provider when craving is empty", async () => {
  let providerRequest;
  const response = await handleGenerateRecipeRequest(
    validRequest({ craving: "" }),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async (_url, init) => {
        providerRequest = JSON.parse(init.body);
        return Response.json({
          output_text: JSON.stringify({
            recipes: [recipe("Spinach Rice Skillet"), recipe("Egg Rice Bowl"), recipe("Cheddar Spinach Cups")],
          }),
        });
      },
    },
  );
  const sentRequest = JSON.parse(providerRequest.input[1].content);

  assert.equal(response.status, 200);
  assert.equal(sentRequest.craving, "flexible meal ideas");
});

test("sends previous recipe titles to the provider as a repeat hint", async () => {
  let providerRequest;
  const response = await handleGenerateRecipeRequest(
    validRequest({
      previousRecipeTitles: [" Spinach Rice Skillet ", "Egg Rice Bowl", ""],
    }),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async (_url, init) => {
        providerRequest = JSON.parse(init.body);
        return Response.json({
          output_text: JSON.stringify({
            recipes: [
              recipe("Cheddar Spinach Cups"),
              recipe("Quick Savory Rice Plate"),
              recipe("Warm Egg And Greens Bowl"),
            ],
          }),
        });
      },
    },
  );
  const sentRequest = JSON.parse(providerRequest.input[1].content);

  assert.equal(response.status, 200);
  assert.deepEqual(sentRequest.previousRecipeTitles, ["Spinach Rice Skillet", "Egg Rice Bowl"]);
});

test("returns fallback recipes that avoid previous exact titles", async () => {
  const response = await handleGenerateRecipeRequest(
    validRequest({
      previousRecipeTitles: [
        "Quick Available-Ingredient Skillet",
        "Flexible Cookooi Bowl",
        "Simple Available-Item Plate",
      ],
    }),
    { COOKOOI_ENABLE_FALLBACK: "true" },
  );
  const body = await response.json();
  const titles = body.recipes.map((fallbackRecipe) => fallbackRecipe.title);

  assert.equal(response.status, 200);
  assert.equal(body.source, "fallback");
  assert.equal(new Set(titles).size, 3);
  assert.deepEqual(
    titles.filter((title) => ["Quick Available-Ingredient Skillet", "Flexible Cookooi Bowl", "Simple Available-Item Plate"].includes(title)),
    [],
  );
});

test("rejects provider output with malformed recipe detail arrays", async () => {
  const response = await handleGenerateRecipeRequest(
    validRequest(),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async () =>
        Response.json({
          output_text: JSON.stringify({
            recipes: [
              recipe("Spinach Rice Skillet", ["eggs", "   "]),
              recipe("Egg Rice Bowl"),
              recipe("Cheddar Spinach Cups"),
            ],
          }),
        }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.error, "invalid_ai_output");
});

test("allows safety notes to mention avoided ingredients", async () => {
  const response = await handleGenerateRecipeRequest(
    validRequest({ constraints: { avoid: "peanuts" } }),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async () =>
        Response.json({
          output_text: JSON.stringify({
            recipes: [
              recipe("Spinach Rice Skillet", ["eggs"], ["Avoid peanuts; cross-contamination cannot be assessed."]),
              recipe("Egg Rice Bowl", ["rice"], ["Avoid peanuts; check ingredient labels."]),
              recipe("Cheddar Spinach Cups", ["spinach"], ["Avoid peanuts in toppings and sauces."]),
            ],
          }),
        }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.recipes.length, 3);
  assert.match(body.recipes[0].allergyNotes[0], /peanuts/);
});

test("filters avoided ingredients out of deterministic fallback recipes", async () => {
  const response = await handleGenerateRecipeRequest(
    validRequest({
      ingredientsText: "peanuts, rice, spinach",
      constraints: { avoid: "peanuts", servings: 3 },
    }),
    { COOKOOI_ENABLE_FALLBACK: "true" },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.source, "fallback");
  assert.equal(body.recipes.length, 3);
  for (const fallbackRecipe of body.recipes) {
    assert.deepEqual(fallbackRecipe.usesFromAvailableItems, ["rice", "spinach"]);
    assert.equal(fallbackRecipe.servings, 3);
    assert.match(fallbackRecipe.allergyNotes.join(" "), /Avoid peanuts/);
    assert.match(fallbackRecipe.allergyNotes.join(" "), /cross-contamination cannot be assessed/);
  }
});

test("rejects unsupported equipment constraints", async () => {
  const response = await handleGenerateRecipeRequest(validRequest({ constraints: { equipment: ["campfire"] } }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_request");
  assert.match(body.message, /unsupported/i);
});

test("rejects unsupported meal type constraints", async () => {
  const response = await handleGenerateRecipeRequest(validRequest({ constraints: { mealType: "brunch-party" } }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_request");
  assert.match(body.message, /meal type/i);
});

test("reflects requested meal type in deterministic fallback notes", async () => {
  const response = await handleGenerateRecipeRequest(
    validRequest({ constraints: { mealType: "breakfast" } }),
    { COOKOOI_ENABLE_FALLBACK: "true" },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(body.recipes[0].dietaryNotes.join(" "), /Meal type: breakfast/);
});

test("rejects provider output that exceeds requested available time", async () => {
  const response = await handleGenerateRecipeRequest(
    validRequest({ constraints: { maxTotalTimeMinutes: 10 } }),
    { OPENAI_API_KEY: "test-key" },
    {
      fetcher: async () =>
        Response.json({
          output_text: JSON.stringify({
            recipes: [recipe("Spinach Rice Skillet"), recipe("Egg Rice Bowl"), recipe("Cheddar Spinach Cups")],
          }),
        }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.error, "invalid_ai_output");
});

function validRequest(overrides = {}, headers = {}) {
  return new Request("http://cookooi.test/api/recipes/generate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      ingredientsText: "eggs, spinach, rice, cheddar",
      craving: "quick dinner",
      ...overrides,
    }),
  });
}

function refineRequest(overrides = {}, headers = {}) {
  return new Request("http://cookooi.test/api/recipes/refine", {
    method: "POST",
    headers: { "content-type": "application/json", "x-cookooi-session": "refine-test-session", ...headers },
    body: JSON.stringify({
      recipe: recipe("Potato Bacon Soup", ["potatoes", "bacon"], ["Contains pork; check any allergy or diet restrictions."]),
      question: "Can I add greens to this potato soup with bacon?",
      generation: {
        source: "fallback",
        provider: "fallback",
        model: "deterministic-fallback",
      },
      ...overrides,
    }),
  });
}

function audioRequest(blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" }), filename = "voice-note.webm") {
  const formData = new FormData();
  if (blob) {
    formData.set("audio", blob, filename);
  }
  return new Request("http://cookooi.test/api/voice/transcribe", {
    method: "POST",
    headers: { "x-cookooi-session": "transcribe-test-session" },
    body: formData,
  });
}

function refinement(overrides = {}) {
  return {
    feasibility: "works",
    explanation: "Leafy greens can work if they are fresh and added near the end so they soften without taking over the soup.",
    modifiedIngredients: ["Add a small handful of chopped leafy greens."],
    modifiedSteps: ["Stir greens into the hot soup during the last few minutes of cooking."],
    allergyNotes: ["Check labels and cross-contact risk for any added greens; Cookooi cannot certify allergy safety."],
    foodSafetyNotes: ["Wash greens well and discard anything wilted, slimy, or off-smelling."],
    confidenceNotes: "Works best with sturdy greens such as kale or spinach.",
    proposedVariant: recipe("Potato Bacon Soup With Greens", ["potatoes", "bacon", "leafy greens"]),
    ...overrides,
  };
}

function recipe(title, used = ["eggs", "spinach", "rice"], allergyNotes = ["Contains egg and dairy."]) {
  return {
    title,
    summary: "A practical quick dinner using ingredients available.",
    usesFromAvailableItems: used,
    itemsStillNeeded: ["lemon"],
    steps: ["Warm the pan.", "Cook the rice mixture.", "Add eggs and spinach.", "Finish with cheddar."],
    prepTimeMinutes: 8,
    cookTimeMinutes: 15,
    servings: 2,
    difficulty: "easy",
    dietaryNotes: ["vegetarian"],
    allergyNotes,
    foodSafetyNotes: ["Cook eggs until set."],
    substitutions: ["Use another melting cheese if cheddar is unavailable."],
    confidenceNotes: "Assumes the rice is already cooked.",
  };
}
