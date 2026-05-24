import { normalizeRecipeSettings } from "./settings-store.js";
import { parseVoiceNoteTranscript } from "./voice-note-parser.js";

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

export function buildRecipeRequestPayloadFromNaturalText(value, baselineSettings = {}) {
  const parsed = parseVoiceNoteTranscript(value);
  const constraints = parsed.constraints || {};

  return buildRecipeRequestPayload(
    {
      ingredientsText: parsed.ingredientsText,
      craving: parsed.craving,
      ...parsedConstraintOverrides(constraints),
    },
    baselineSettings,
  );
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

function parsedConstraintOverrides(constraints) {
  const overrides = {};

  for (const field of ["avoid", "diet", "mealType", "cuisineOrFlavor"]) {
    if (cleanText(constraints[field])) {
      overrides[field] = constraints[field];
    }
  }
  for (const field of ["servings", "maxTotalTimeMinutes"]) {
    if (Number.isFinite(constraints[field])) {
      overrides[field] = constraints[field];
    }
  }
  if (Array.isArray(constraints.equipment) && constraints.equipment.length) {
    overrides.equipment = constraints.equipment;
  }

  return overrides;
}
