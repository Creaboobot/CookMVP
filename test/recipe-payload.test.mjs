import test from "node:test";
import assert from "node:assert/strict";
import { buildRecipeRequestPayload } from "../public/recipe-payload.js";

test("builds the browser recipe request payload with user constraints", () => {
  const payload = buildRecipeRequestPayload({
    ingredientsText: " eggs, spinach ",
    craving: " quick dinner ",
    avoid: " peanuts ",
    diet: "vegetarian",
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
      servings: 4,
      maxTotalTimeMinutes: 30,
      cuisineOrFlavor: "bright Thai",
      equipment: ["oven", "air-fryer"],
    },
  });
});
