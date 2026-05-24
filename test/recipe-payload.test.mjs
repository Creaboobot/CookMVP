import test from "node:test";
import assert from "node:assert/strict";
import { buildRecipeRequestPayload, buildRecipeRequestPayloadFromNaturalText } from "../public/recipe-payload.js";

test("builds the browser recipe request payload with user constraints", () => {
  const payload = buildRecipeRequestPayload({
    ingredientsText: " eggs, spinach ",
    craving: " quick dinner ",
    avoid: " peanuts ",
    diet: "vegetarian",
    mealType: "dinner",
    servings: "4",
    maxTotalTimeMinutes: "30",
    cuisineOrFlavor: " bright Thai ",
    equipment: ["oven", "air-fryer", "unsupported", "oven"],
  });

  assert.deepEqual(payload, {
    ingredientsText: "eggs, spinach",
    craving: "quick dinner",
    constraints: {
      avoid: "peanuts",
      diet: "vegetarian",
      mealType: "dinner",
      servings: 4,
      maxTotalTimeMinutes: 30,
      cuisineOrFlavor: "bright Thai",
      equipment: ["oven", "air-fryer"],
    },
  });
});

test("allows browser recipe requests without a craving", () => {
  const payload = buildRecipeRequestPayload({
    ingredientsText: " eggs, spinach ",
    craving: "   ",
    avoid: "",
    diet: "none",
    servings: "2",
    maxTotalTimeMinutes: "",
    cuisineOrFlavor: "",
    equipment: [],
  });

  assert.deepEqual(payload, {
    ingredientsText: "eggs, spinach",
    craving: "",
    constraints: {
      diet: "none",
      mealType: "flexible",
      servings: 2,
    },
  });
});

test("merges saved baseline settings unless current values override them", () => {
  const payload = buildRecipeRequestPayload(
    {
      ingredientsText: " chickpeas, greens ",
      craving: "   ",
      servings: "5",
    },
    {
      avoid: "shellfish",
      diet: "vegan",
      mealType: "lunch",
      servings: 2,
      maxTotalTimeMinutes: 45,
      cuisineOrFlavor: "lemony",
      equipment: ["stovetop"],
    },
  );

  assert.deepEqual(payload, {
    ingredientsText: "chickpeas, greens",
    craving: "",
    constraints: {
      avoid: "shellfish",
      diet: "vegan",
      mealType: "lunch",
      servings: 5,
      maxTotalTimeMinutes: 45,
      cuisineOrFlavor: "lemony",
      equipment: ["stovetop"],
    },
  });
});

test("lets parsed voice constraints override saved baseline settings", () => {
  const payload = buildRecipeRequestPayload(
    {
      ingredientsText: " potatoes, kale ",
      craving: " quick soup ",
      avoid: "peanuts",
      mealType: "dinner",
      servings: "3",
      maxTotalTimeMinutes: "30",
      equipment: ["stovetop"],
    },
    {
      avoid: "shellfish",
      diet: "vegetarian",
      mealType: "lunch",
      servings: 2,
      maxTotalTimeMinutes: 45,
      cuisineOrFlavor: "lemony",
      equipment: ["oven"],
    },
  );

  assert.deepEqual(payload, {
    ingredientsText: "potatoes, kale",
    craving: "quick soup",
    constraints: {
      avoid: "peanuts",
      diet: "vegetarian",
      mealType: "dinner",
      servings: 3,
      maxTotalTimeMinutes: 30,
      cuisineOrFlavor: "lemony",
      equipment: ["stovetop"],
    },
  });
});

test("builds a structured request from the combined Ingredients and craving field", () => {
  const text =
    "eggs, spinach, feta, leftover rice, lemon. Something quick and savory. No peanuts, stovetop only, for two under 30 minutes.";
  const payload = buildRecipeRequestPayloadFromNaturalText(text, {
    diet: "vegetarian",
    mealType: "dinner",
    servings: 4,
    equipment: ["oven"],
  });

  assert.deepEqual(payload, {
    ingredientsText: "eggs, spinach, feta, leftover rice, lemon",
    craving: "Something quick and savory",
    constraints: {
      avoid: "peanuts",
      diet: "vegetarian",
      mealType: "dinner",
      servings: 2,
      maxTotalTimeMinutes: 30,
      equipment: ["stovetop"],
    },
  });
});

test("builds combined comma input without leaking equipment into available items", () => {
  const payload = buildRecipeRequestPayloadFromNaturalText(
    "eggs, spinach, feta, stovetop only, for two under 30 minutes",
  );

  assert.deepEqual(payload, {
    ingredientsText: "eggs, spinach, feta",
    craving: "",
    constraints: {
      diet: "none",
      mealType: "flexible",
      servings: 2,
      maxTotalTimeMinutes: 30,
      equipment: ["stovetop"],
    },
  });
});

test("builds no-punctuation combined input without leaking constraints", () => {
  const payload = buildRecipeRequestPayloadFromNaturalText(
    "I have eggs, spinach, feta and want something quick no peanuts stovetop only for two under 30 minutes",
  );

  assert.deepEqual(payload, {
    ingredientsText: "eggs, spinach, feta",
    craving: "something quick",
    constraints: {
      avoid: "peanuts",
      diet: "none",
      mealType: "flexible",
      servings: 2,
      maxTotalTimeMinutes: 30,
      equipment: ["stovetop"],
    },
  });
});
