import { getSessionId, importFeedbackData, readFeedbackData } from "./feedback-store.js";
import { normalizeRecipeForDisplay } from "./recipe-display.js";
import { importRecipeSettings, readRecipeSettingsRecord } from "./settings-store.js";

const savedRecipesKey = "cookooi-library-v1";
const feedbackDataKey = "cookooi-feedback-v1";
const sessionExportVersion = 1;
const maxSavedRecipes = 100;

export function readSavedRecipeEntries(storage = browserStorage()) {
  return readSavedRecipeData(storage).savedRecipes;
}

export function isRecipeSaved(recipe, storage = browserStorage()) {
  const normalizedRecipe = normalizeRecipeForDisplay(recipe);
  return readSavedRecipeEntries(storage).some((entry) => recipesMatch(entry.recipe, normalizedRecipe));
}

export function saveRecipeToLibrary({ recipe, sessionId, generationId, storage = browserStorage() }) {
  const data = readSavedRecipeData(storage);
  const normalizedRecipe = normalizeRecipeForDisplay(recipe);
  const existing = data.savedRecipes.find((entry) => recipesMatch(entry.recipe, normalizedRecipe));
  const entry = {
    id: normalizedRecipe.id,
    sessionId: cleanText(sessionId) || data.sessionId,
    generationId: cleanText(generationId) || findGenerationId(normalizedRecipe, storage),
    savedAt: existing?.savedAt || new Date().toISOString(),
    source: normalizedRecipe.source,
    provider: normalizedRecipe.provider,
    model: normalizedRecipe.model,
    recipeCreatedAt: normalizedRecipe.createdAt,
    recipe: normalizedRecipe,
  };

  data.savedRecipes = [entry, ...data.savedRecipes.filter((item) => !recipesMatch(item.recipe, normalizedRecipe))].slice(
    0,
    maxSavedRecipes,
  );
  writeSavedRecipeData(storage, data);

  return entry;
}

export function removeSavedRecipe(recipeId, storage = browserStorage()) {
  const id = cleanText(recipeId);
  const data = readSavedRecipeData(storage);

  data.savedRecipes = data.savedRecipes.filter((entry) => entry.id !== id && entry.recipe.id !== id);
  writeSavedRecipeData(storage, data);

  return data.savedRecipes;
}

export function clearSavedRecipes(storage = browserStorage()) {
  storage.removeItem(savedRecipesKey);
}

export function sessionSummary(storage = browserStorage()) {
  const feedback = readFeedbackData(storage);
  const savedRecipes = readSavedRecipeEntries(storage);

  return {
    generationCount: feedback.generations.length,
    feedbackCount: feedback.feedback.length,
    savedRecipeCount: savedRecipes.length,
  };
}

export function clearSessionData(storage = browserStorage()) {
  clearSavedRecipes(storage);
  storage.removeItem(feedbackDataKey);
}

export function exportSessionData(storage = browserStorage()) {
  return JSON.stringify(
    {
      version: sessionExportVersion,
      exportedAt: new Date().toISOString(),
      sessionId: getSessionId(storage),
      savedRecipes: readSavedRecipeEntries(storage),
      settings: readRecipeSettingsRecord(storage),
      feedbackData: readFeedbackData(storage),
    },
    null,
    2,
  );
}

export function importSessionData(candidate, storage = browserStorage()) {
  if (isFeedbackOnlyExport(candidate)) {
    importFeedbackData(candidate, storage);
    return {
      savedRecipes: readSavedRecipeEntries(storage),
      feedbackData: readFeedbackData(storage),
    };
  }

  if (!candidate || typeof candidate !== "object" || candidate.version !== sessionExportVersion) {
    throw new Error("Import must be Cookooi session or feedback JSON.");
  }

  if (!Array.isArray(candidate.savedRecipes) || !candidate.feedbackData) {
    throw new Error("Import must include saved recipes and feedback data.");
  }

  writeSavedRecipeData(storage, normalizeSavedRecipeData(candidate, getSessionId(storage)));
  if (candidate.settings !== undefined) {
    importRecipeSettings(candidate.settings, storage);
  }
  importFeedbackData(candidate.feedbackData, storage);

  return {
    savedRecipes: readSavedRecipeEntries(storage),
    feedbackData: readFeedbackData(storage),
  };
}

function readSavedRecipeData(storage) {
  const sessionId = getSessionId(storage);
  const raw = storage.getItem(savedRecipesKey);

  if (!raw) {
    return emptySavedRecipeData(sessionId);
  }

  try {
    return normalizeSavedRecipeData(JSON.parse(raw), sessionId);
  } catch {
    return emptySavedRecipeData(sessionId);
  }
}

function writeSavedRecipeData(storage, data) {
  storage.setItem(savedRecipesKey, JSON.stringify(normalizeSavedRecipeData(data, data.sessionId)));
}

function normalizeSavedRecipeData(value, fallbackSessionId) {
  const savedRecipes = Array.isArray(value)
    ? value.map((recipe) => normalizeSavedRecipeEntry({ recipe }, fallbackSessionId)).filter(Boolean)
    : Array.isArray(value?.savedRecipes)
      ? value.savedRecipes.map((entry) => normalizeSavedRecipeEntry(entry, fallbackSessionId)).filter(Boolean)
      : [];

  return {
    version: sessionExportVersion,
    sessionId: cleanText(value?.sessionId) || fallbackSessionId,
    savedRecipes: savedRecipes.slice(0, maxSavedRecipes),
  };
}

function normalizeSavedRecipeEntry(entry, fallbackSessionId) {
  const recipe = normalizeRecipeForDisplay(entry?.recipe || entry);

  if (!recipe.title || recipe.title === "Untitled recipe") {
    return null;
  }

  return {
    id: cleanText(entry?.id) || recipe.id,
    sessionId: cleanText(entry?.sessionId) || fallbackSessionId,
    generationId: cleanText(entry?.generationId),
    savedAt: cleanText(entry?.savedAt),
    source: cleanText(entry?.source) || recipe.source,
    provider: cleanText(entry?.provider) || recipe.provider,
    model: cleanText(entry?.model) || recipe.model,
    recipeCreatedAt: cleanText(entry?.recipeCreatedAt) || recipe.createdAt,
    recipe,
  };
}

function emptySavedRecipeData(sessionId) {
  return {
    version: sessionExportVersion,
    sessionId,
    savedRecipes: [],
  };
}

function findGenerationId(recipe, storage) {
  return readFeedbackData(storage).generations.find((generation) => generation.recipeIds.includes(recipe.id))?.id || "";
}

function recipesMatch(left, right) {
  return left.id === right.id || (left.title === right.title && left.summary === right.summary);
}

function isFeedbackOnlyExport(candidate) {
  return (
    candidate &&
    typeof candidate === "object" &&
    candidate.version === sessionExportVersion &&
    Array.isArray(candidate.generations) &&
    Array.isArray(candidate.feedback)
  );
}

function browserStorage() {
  return window.localStorage;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
