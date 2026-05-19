import test from "node:test";
import assert from "node:assert/strict";
import { handleGenerateRecipeRequest } from "../src/recipe-api.mjs";

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

test("rejects invalid payloads", async () => {
  const response = await handleGenerateRecipeRequest(
    new Request("http://cookooi.test/api/recipes/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ingredientsText: "eggs", craving: "" }),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_request");
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

test("rejects unsupported equipment constraints", async () => {
  const response = await handleGenerateRecipeRequest(validRequest({ constraints: { equipment: ["campfire"] } }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_request");
  assert.match(body.message, /unsupported/i);
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

function validRequest(overrides = {}) {
  return new Request("http://cookooi.test/api/recipes/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ingredientsText: "eggs, spinach, rice, cheddar",
      craving: "quick dinner",
      ...overrides,
    }),
  });
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
