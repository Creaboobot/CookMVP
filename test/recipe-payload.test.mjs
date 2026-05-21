import test from "node:test";
import assert from "node:assert/strict";
import { buildRecipeRequestPayload } from "../public/recipe-payload.js";

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
