import { normalizeRecipeSettings } from "./settings-store.js";

const supportedDietValues = new Set(["none", "vegetarian", "vegan", "gluten-free", "dairy-free", "halal", "kosher"]);
const supportedEquipmentValues = new Set(["oven", "stovetop", "microwave", "blender", "air-fryer"]);
const supportedMealTypes = new Set(["flexible", "breakfast", "lunch", "dinner", "snack"]);

export function buildRecipeRequestPayload(values, baselineSettings = {}) {
  const constraintValues = {
    ...normalizeRecipeSettings(baselineSettings),
    ...values,
  };

  return {
    ingredientsText: cleanText(values.ingredientsText),
    craving: cleanText(values.craving),
    constraints: buildConstraintsPayload(constraintValues),
  };
}

export function buildConstraintsPayload(values) {
  const constraints = {};
  const avoid = cleanText(values.avoid);
  const diet = cleanText(values.diet);
  const servings = Number.parseInt(values.servings, 10);
  const maxTotalTimeMinutes = Number.parseInt(values.maxTotalTimeMinutes, 10);
  const cuisineOrFlavor = cleanText(values.cuisineOrFlavor);
  const mealType = cleanText(values.mealType);
  const equipment = Array.isArray(values.equipment) ? values.equipment : [];

  if (avoid) {
    constraints.avoid = avoid;
  }

  if (supportedDietValues.has(diet)) {
    constraints.diet = diet;
  }

  if (Number.isInteger(servings) && servings >= 1 && servings <= 12) {
    constraints.servings = servings;
  }

  if (Number.isInteger(maxTotalTimeMinutes) && maxTotalTimeMinutes >= 5 && maxTotalTimeMinutes <= 240) {
    constraints.maxTotalTimeMinutes = maxTotalTimeMinutes;
  }

  if (cuisineOrFlavor) {
    constraints.cuisineOrFlavor = cuisineOrFlavor;
  }

  if (supportedMealTypes.has(mealType)) {
    constraints.mealType = mealType;
  }

  const selectedEquipment = equipment.filter((item) => supportedEquipmentValues.has(item));
  if (selectedEquipment.length) {
    constraints.equipment = [...new Set(selectedEquipment)];
  }

  return constraints;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
