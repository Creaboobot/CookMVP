import test from "node:test";
import assert from "node:assert/strict";
import {
  mapServerRecipe,
  normalizeRecipeForDisplay,
  recipeMetaItems,
  recipeOverviewCountLabel,
  recipeSourceLabel,
} from "../public/recipe-display.js";

test("maps server recipes without dropping result details", () => {
  const mapped = mapServerRecipe(
    {
      title: "Spinach Rice Skillet",
      summary: "A quick dinner using ingredients available.",
      usesFromAvailableItems: ["eggs", "spinach", "rice"],
      itemsStillNeeded: ["lemon"],
      steps: ["Warm the pan.", "Cook the rice mixture.", "Finish with cheddar."],
      prepTimeMinutes: 8,
      cookTimeMinutes: 15,
      servings: 2,
      difficulty: "easy",
      dietaryNotes: ["vegetarian"],
      allergyNotes: ["Contains egg and dairy."],
      foodSafetyNotes: ["Cook eggs until set."],
      substitutions: ["Use another melting cheese."],
      confidenceNotes: "Assumes the rice is already cooked.",
    },
    {
      source: "ai",
      provider: "openai",
      model: "test-model",
      createdAt: "2026-05-19T16:00:00.000Z",
    },
    1,
  );

  assert.equal(mapped.id, "2026-05-19T16:00:00.000Z-1");
  assert.equal(mapped.type, "easy recipe");
  assert.deepEqual(mapped.usesFromAvailableItems, ["eggs", "spinach", "rice"]);
  assert.deepEqual(mapped.itemsStillNeeded, ["lemon"]);
  assert.deepEqual(mapped.steps, ["Warm the pan.", "Cook the rice mixture.", "Finish with cheddar."]);
  assert.deepEqual(mapped.substitutions, ["Use another melting cheese."]);
  assert.deepEqual(mapped.dietaryNotes, ["vegetarian"]);
  assert.deepEqual(mapped.allergyNotes, ["Contains egg and dairy."]);
  assert.deepEqual(mapped.foodSafetyNotes, ["Cook eggs until set."]);
  assert.equal(mapped.confidenceNotes, "Assumes the rice is already cooked.");
  assert.deepEqual(recipeMetaItems(mapped), ["Prep 8 min", "Cook 15 min", "Serves 2", "Easy"]);
  assert.equal(recipeOverviewCountLabel(mapped), "3 items used - 1 item still needed");
  assert.equal(recipeSourceLabel(mapped), "openai test-model");
});

test("normalizes older saved recipes for detail rendering", () => {
  const normalized = normalizeRecipeForDisplay({
    id: "legacy-1",
    type: "Fallback result",
    title: "Simple Pantry Plate",
    summary: "A saved recipe from an older browser build.",
    used: ["rice"],
    missing: ["lemon"],
  });

  assert.equal(normalized.id, "legacy-1");
  assert.deepEqual(normalized.usesFromAvailableItems, ["rice"]);
  assert.deepEqual(normalized.itemsStillNeeded, ["lemon"]);
  assert.deepEqual(normalized.steps, []);
  assert.equal(recipeSourceLabel(normalized), "AI");
});

test("labels fallback recipes as non-AI output", () => {
  const mapped = mapServerRecipe(
    {
      title: "Simple Pantry Plate",
      summary: "A fallback recipe.",
      usesFromAvailableItems: ["rice"],
      itemsStillNeeded: ["seasoning"],
      steps: ["Check items.", "Cook.", "Season.", "Serve."],
      prepTimeMinutes: 5,
      cookTimeMinutes: 10,
      servings: 2,
      difficulty: "easy",
      dietaryNotes: [],
      allergyNotes: ["Check labels."],
      foodSafetyNotes: ["Cook thoroughly."],
      substitutions: [],
      confidenceNotes: "Fallback output.",
    },
    { source: "fallback", provider: "fallback", createdAt: "2026-05-19T16:00:00.000Z" },
  );

  assert.equal(mapped.type, "Fallback result");
  assert.equal(recipeSourceLabel(mapped), "Fallback output, not AI-generated");
});
