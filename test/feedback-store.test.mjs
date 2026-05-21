import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionId,
  exportFeedbackData,
  feedbackSummary,
  getSessionId,
  importFeedbackData,
  markRecipeSaved,
  readFeedbackData,
  recordGenerationFailure,
  recordGenerationSuccess,
  saveRecipeFeedback,
  summarizeGenerationContext,
} from "../public/feedback-store.js";

test("summarizes generation context without storing raw tester input", () => {
  const summary = summarizeGenerationContext({
    ingredientsText: "eggs, spinach and rice",
    craving: "quick spicy dinner",
    previousRecipeTitles: ["Spinach Rice Skillet", "Egg Rice Bowl"],
    constraints: {
      avoid: "peanuts",
      diet: "vegetarian",
      servings: 4,
      maxTotalTimeMinutes: 30,
      cuisineOrFlavor: "Thai",
      equipment: ["stovetop", "air-fryer"],
    },
  });

  assert.deepEqual(summary, {
    availableItemCount: 3,
    cravingLength: 18,
    previousRecipeTitleCount: 2,
    constraints: {
      hasAvoidances: true,
      diet: "vegetarian",
      servings: 4,
      maxTotalTimeMinutes: 30,
      hasCuisineOrFlavor: true,
      equipment: ["stovetop", "air-fryer"],
    },
  });
  assert.equal(JSON.stringify(summary).includes("peanuts"), false);
  assert.equal(JSON.stringify(summary).includes("Thai"), false);
});

test("records generations, feedback, and save markers in local feedback data", () => {
  const storage = createMemoryStorage();
  const sessionId = getSessionId(storage);
  const generation = recordGenerationSuccess({
    storage,
    sessionId,
    payload: {
      ingredientsText: "eggs, rice",
      craving: "fast dinner",
      constraints: { servings: 2 },
    },
    generation: {
      createdAt: "2026-05-20T07:30:00.000Z",
      source: "fallback",
      provider: "fallback",
      model: "test-model",
    },
    recipes: [{ id: "recipe-1" }, { id: "recipe-2" }, { id: "recipe-3" }],
  });

  assert.equal(generation.status, "success");
  assert.equal(generation.fallback, true);
  assert.deepEqual(generation.recipeIds, ["recipe-1", "recipe-2", "recipe-3"]);

  const feedback = saveRecipeFeedback({
    storage,
    recipe: { id: "recipe-1", title: "Rice Skillet", source: "fallback" },
    rating: "up",
    note: "Useful, but a little plain.",
  });

  markRecipeSaved({ id: "recipe-1" }, storage);

  const data = readFeedbackData(storage);
  assert.equal(feedback.generationId, generation.id);
  assert.equal(data.feedback.length, 1);
  assert.deepEqual(data.savedRecipeIds, ["recipe-1"]);
  assert.deepEqual(data.generations[0].savedRecipeIds, ["recipe-1"]);
  assert.deepEqual(feedbackSummary(storage), {
    generationCount: 1,
    feedbackCount: 1,
    savedRecipeCount: 1,
  });
});

test("records retryable generation failures without raw payload text", () => {
  const storage = createMemoryStorage();
  const error = new Error("Provider unavailable");
  error.code = "provider_unavailable";
  error.retryable = true;

  const record = recordGenerationFailure({
    storage,
    sessionId: "session-1",
    payload: {
      ingredientsText: "secret family sauce, chicken",
      craving: "birthday dinner",
      constraints: { avoid: "shellfish" },
    },
    error,
  });

  const storedData = JSON.stringify(readFeedbackData(storage));

  assert.equal(record.status, "failure");
  assert.equal(record.errorCode, "provider_unavailable");
  assert.equal(record.retryable, true);
  assert.equal(storedData.includes("secret family sauce"), false);
  assert.equal(storedData.includes("shellfish"), false);
});

test("exports and imports Cookooi feedback JSON", () => {
  const storage = createMemoryStorage();
  recordGenerationSuccess({
    storage,
    sessionId: "session-1",
    payload: { ingredientsText: "eggs", craving: "breakfast", constraints: {} },
    generation: { createdAt: "2026-05-20T07:30:00.000Z", source: "ai" },
    recipes: [{ id: "recipe-1" }],
  });

  const importedStorage = createMemoryStorage();
  const imported = importFeedbackData(JSON.parse(exportFeedbackData(storage)), importedStorage);

  assert.equal(imported.version, 1);
  assert.equal(readFeedbackData(importedStorage).generations.length, 1);
});

test("creates stable-looking anonymous session ids", () => {
  assert.equal(createSessionId(new Date("2026-05-20T07:30:15.000Z"), 0.5), "cookooi-20260520073015-80000000");
});

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
