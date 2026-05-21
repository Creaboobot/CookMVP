import test from "node:test";
import assert from "node:assert/strict";
import {
  importRecipeSettings,
  readRecipeSettings,
  resetRecipeSettings,
  saveRecipeSettings,
} from "../public/settings-store.js";

test("stores normalized baseline recipe settings locally", () => {
  const storage = createMemoryStorage();
  const settings = saveRecipeSettings(
    {
      avoid: " peanuts ",
      diet: "vegetarian",
      mealType: "dinner",
      servings: "4",
      maxTotalTimeMinutes: "30",
      cuisineOrFlavor: " bright Thai ",
      equipment: ["oven", "air fryer", "unsupported", "oven"],
    },
    storage,
  );

  assert.deepEqual(settings, {
    avoid: "peanuts",
    diet: "vegetarian",
    mealType: "dinner",
    servings: 4,
    maxTotalTimeMinutes: 30,
    cuisineOrFlavor: "bright Thai",
    equipment: ["oven", "air-fryer"],
  });
  assert.deepEqual(readRecipeSettings(storage), settings);
});

test("imports and resets baseline settings without session data", () => {
  const storage = createMemoryStorage();

  importRecipeSettings(
    {
      version: 1,
      updatedAt: "2026-05-21T10:00:00.000Z",
      settings: {
        diet: "vegan",
        mealType: "lunch",
        servings: 3,
        equipment: ["stovetop"],
      },
    },
    storage,
  );

  assert.equal(readRecipeSettings(storage).diet, "vegan");
  assert.equal(readRecipeSettings(storage).mealType, "lunch");

  assert.deepEqual(resetRecipeSettings(storage), {
    avoid: "",
    diet: "none",
    mealType: "flexible",
    servings: 2,
    maxTotalTimeMinutes: "",
    cuisineOrFlavor: "",
    equipment: [],
  });
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
