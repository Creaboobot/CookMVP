import test from "node:test";
import assert from "node:assert/strict";
import {
  clearSessionData,
  exportSessionData,
  importSessionData,
  isRecipeSaved,
  readSavedRecipeEntries,
  removeSavedRecipe,
  saveRecipeToLibrary,
  sessionSummary,
} from "../public/session-store.js";
import { recordGenerationSuccess, saveRecipeFeedback } from "../public/feedback-store.js";
import { readRecipeSettings, saveRecipeSettings } from "../public/settings-store.js";

test("normalizes legacy saved recipe arrays into session entries", () => {
  const storage = createMemoryStorage();
  storage.setItem(
    "cookooi-library-v1",
    JSON.stringify([
      {
        id: "legacy-1",
        title: "Saved Rice Bowl",
        summary: "A saved recipe from an older build.",
        used: ["rice"],
        missing: ["lime"],
      },
    ]),
  );

  const [entry] = readSavedRecipeEntries(storage);

  assert.equal(entry.id, "legacy-1");
  assert.equal(entry.sessionId.startsWith("cookooi-"), true);
  assert.equal(entry.recipe.title, "Saved Rice Bowl");
  assert.deepEqual(entry.recipe.usesFromAvailableItems, ["rice"]);
  assert.deepEqual(entry.recipe.itemsStillNeeded, ["lime"]);
});

test("stores saved recipes with session and generation metadata", () => {
  const storage = createMemoryStorage();
  recordGenerationSuccess({
    storage,
    sessionId: "session-1",
    payload: { ingredientsText: "eggs, rice", craving: "fast dinner", constraints: {} },
    generation: { createdAt: "2026-05-20T07:30:00.000Z", source: "ai", provider: "openai", model: "test-model" },
    recipes: [{ id: "recipe-1" }],
  });

  const entry = saveRecipeToLibrary({
    storage,
    sessionId: "session-1",
    recipe: {
      id: "recipe-1",
      title: "Rice Skillet",
      summary: "A quick dinner.",
      usesFromAvailableItems: ["rice"],
      itemsStillNeeded: [],
      source: "ai",
      provider: "openai",
      model: "test-model",
      createdAt: "2026-05-20T07:30:00.000Z",
    },
  });

  assert.equal(entry.sessionId, "session-1");
  assert.equal(entry.generationId, "generation-2026-05-20T07:30:00.000Z");
  assert.equal(entry.source, "ai");
  assert.equal(readSavedRecipeEntries(storage).length, 1);
  assert.equal(isRecipeSaved({ id: "recipe-1", title: "Rice Skillet", summary: "A quick dinner." }, storage), true);

  saveRecipeToLibrary({
    storage,
    sessionId: "session-1",
    recipe: { id: "recipe-1", title: "Rice Skillet", summary: "A quick dinner." },
  });

  assert.equal(readSavedRecipeEntries(storage).length, 1);
});

test("exports, imports, removes, and clears complete session data", () => {
  const storage = createMemoryStorage();
  recordGenerationSuccess({
    storage,
    sessionId: "session-1",
    payload: { ingredientsText: "eggs", craving: "breakfast", constraints: {} },
    generation: { createdAt: "2026-05-20T07:30:00.000Z", source: "fallback" },
    recipes: [{ id: "recipe-1" }],
  });
  saveRecipeToLibrary({
    storage,
    sessionId: "session-1",
    generationId: "generation-2026-05-20T07:30:00.000Z",
    recipe: { id: "recipe-1", title: "Breakfast Eggs", summary: "Fast breakfast.", source: "fallback" },
  });
  saveRecipeFeedback({
    storage,
    recipe: { id: "recipe-1", title: "Breakfast Eggs", source: "fallback" },
    rating: "up",
    note: "Useful.",
  });
  saveRecipeSettings(
    {
      avoid: "peanuts",
      diet: "vegetarian",
      mealType: "dinner",
      servings: 4,
      maxTotalTimeMinutes: 30,
      cuisineOrFlavor: "smoky",
      equipment: ["oven"],
    },
    storage,
  );

  const importedStorage = createMemoryStorage();
  const imported = importSessionData(JSON.parse(exportSessionData(storage)), importedStorage);

  assert.equal(imported.savedRecipes.length, 1);
  assert.equal(imported.feedbackData.feedback.length, 1);
  assert.deepEqual(sessionSummary(importedStorage), {
    generationCount: 1,
    refinementCount: 0,
    feedbackCount: 1,
    savedRecipeCount: 1,
  });
  assert.deepEqual(readRecipeSettings(importedStorage), {
    avoid: "peanuts",
    diet: "vegetarian",
    mealType: "dinner",
    servings: 4,
    maxTotalTimeMinutes: 30,
    cuisineOrFlavor: "smoky",
    equipment: ["oven"],
  });

  removeSavedRecipe("recipe-1", importedStorage);
  assert.equal(readSavedRecipeEntries(importedStorage).length, 0);

  clearSessionData(importedStorage);
  assert.deepEqual(sessionSummary(importedStorage), {
    generationCount: 0,
    refinementCount: 0,
    feedbackCount: 0,
    savedRecipeCount: 0,
  });
  assert.equal(readRecipeSettings(importedStorage).diet, "vegetarian");
});

test("imports Task 9 feedback-only JSON without dropping saved recipes", () => {
  const storage = createMemoryStorage();
  saveRecipeToLibrary({
    storage,
    sessionId: "session-1",
    recipe: { id: "recipe-1", title: "Saved Soup", summary: "Keep this saved recipe." },
  });

  importSessionData(
    {
      version: 1,
      sessionId: "session-1",
      generations: [
        {
          id: "generation-1",
          sessionId: "session-1",
          createdAt: "2026-05-20T07:30:00.000Z",
          status: "success",
          source: "ai",
          recipeIds: ["recipe-1"],
          recipeCount: 1,
          savedRecipeIds: [],
          context: {},
        },
      ],
      feedback: [],
      savedRecipeIds: [],
    },
    storage,
  );

  assert.equal(readSavedRecipeEntries(storage).length, 1);
  assert.equal(sessionSummary(storage).generationCount, 1);
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
