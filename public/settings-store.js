const settingsKey = "cookooi-settings-v1";
const settingsVersion = 1;
const supportedDietValues = new Set(["none", "vegetarian", "vegan", "gluten-free", "dairy-free", "halal", "kosher"]);
const supportedMealTypes = new Set(["flexible", "breakfast", "lunch", "dinner", "snack"]);
const supportedEquipmentValues = new Set(["oven", "stovetop", "microwave", "blender", "air-fryer"]);

export const defaultRecipeSettings = Object.freeze({
  avoid: "",
  diet: "none",
  servings: 2,
  maxTotalTimeMinutes: "",
  cuisineOrFlavor: "",
  equipment: [],
  mealType: "flexible",
});

export function readRecipeSettings(storage = browserStorage()) {
  return readRecipeSettingsRecord(storage).settings;
}

export function readRecipeSettingsRecord(storage = browserStorage()) {
  const raw = storage.getItem(settingsKey);

  if (!raw) {
    return emptySettingsRecord();
  }

  try {
    return normalizeRecipeSettingsRecord(JSON.parse(raw));
  } catch {
    return emptySettingsRecord();
  }
}

export function saveRecipeSettings(values, storage = browserStorage()) {
  const record = {
    version: settingsVersion,
    updatedAt: new Date().toISOString(),
    settings: normalizeRecipeSettings(values),
  };

  storage.setItem(settingsKey, JSON.stringify(record));
  return record.settings;
}

export function importRecipeSettings(candidate, storage = browserStorage()) {
  const record = normalizeRecipeSettingsRecord(candidate);
  storage.setItem(settingsKey, JSON.stringify(record));
  return record.settings;
}

export function resetRecipeSettings(storage = browserStorage()) {
  storage.removeItem(settingsKey);
  return readRecipeSettings(storage);
}

export function normalizeRecipeSettings(values = {}) {
  const source = values && typeof values === "object" && !Array.isArray(values) ? values : {};
  const avoid = cleanText(source.avoid);
  const diet = cleanText(source.diet);
  const servings = Number.parseInt(source.servings, 10);
  const maxTotalTimeMinutes = Number.parseInt(source.maxTotalTimeMinutes, 10);
  const cuisineOrFlavor = cleanText(source.cuisineOrFlavor);
  const mealType = cleanText(source.mealType);
  const equipment = Array.isArray(source.equipment) ? source.equipment : [];
  const selectedEquipment = equipment
    .map((item) => cleanText(item).toLowerCase().replace(/\s+/g, "-"))
    .filter((item) => supportedEquipmentValues.has(item));

  return {
    avoid,
    diet: supportedDietValues.has(diet) ? diet : defaultRecipeSettings.diet,
    servings: Number.isInteger(servings) && servings >= 1 && servings <= 12 ? servings : defaultRecipeSettings.servings,
    maxTotalTimeMinutes:
      Number.isInteger(maxTotalTimeMinutes) && maxTotalTimeMinutes >= 5 && maxTotalTimeMinutes <= 240
        ? maxTotalTimeMinutes
        : defaultRecipeSettings.maxTotalTimeMinutes,
    cuisineOrFlavor,
    equipment: [...new Set(selectedEquipment)],
    mealType: supportedMealTypes.has(mealType) ? mealType : defaultRecipeSettings.mealType,
  };
}

function normalizeRecipeSettingsRecord(value) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const settings = normalizeRecipeSettings(record.settings || record);

  return {
    version: settingsVersion,
    updatedAt: cleanText(record.updatedAt),
    settings,
  };
}

function emptySettingsRecord() {
  return {
    version: settingsVersion,
    updatedAt: "",
    settings: { ...defaultRecipeSettings, equipment: [] },
  };
}

function browserStorage() {
  return window.localStorage;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
