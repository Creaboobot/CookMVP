const fallbackTitle = "Untitled recipe";
const fallbackSummary = "No summary provided.";

export function mapServerRecipe(recipe, generation = {}, index = 0) {
  const createdAt = generation.createdAt || new Date().toISOString();
  const difficulty = cleanText(recipe?.difficulty);
  const source = cleanText(generation.source) || "ai";

  return normalizeRecipeForDisplay({
    id: `${createdAt}-${index}`,
    type: source === "fallback" ? "Fallback result" : `${difficulty || "Suggested"} recipe`,
    title: recipe?.title,
    summary: recipe?.summary,
    usesFromAvailableItems: recipe?.usesFromAvailableItems,
    itemsStillNeeded: recipe?.itemsStillNeeded,
    steps: recipe?.steps,
    prepTimeMinutes: recipe?.prepTimeMinutes,
    cookTimeMinutes: recipe?.cookTimeMinutes,
    servings: recipe?.servings,
    difficulty,
    dietaryNotes: recipe?.dietaryNotes,
    allergyNotes: recipe?.allergyNotes,
    foodSafetyNotes: recipe?.foodSafetyNotes,
    substitutions: recipe?.substitutions,
    confidenceNotes: recipe?.confidenceNotes,
    source,
    provider: generation.provider,
    model: generation.model,
    createdAt,
  });
}

export function normalizeRecipeForDisplay(recipe = {}) {
  const usesFromAvailableItems = cleanList(recipe.usesFromAvailableItems || recipe.used);
  const itemsStillNeeded = cleanList(recipe.itemsStillNeeded || recipe.missing);

  return {
    id: cleanText(recipe.id) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: cleanText(recipe.type) || "Recipe",
    title: cleanText(recipe.title) || fallbackTitle,
    summary: cleanText(recipe.summary) || fallbackSummary,
    usesFromAvailableItems,
    itemsStillNeeded,
    steps: cleanList(recipe.steps),
    prepTimeMinutes: positiveInteger(recipe.prepTimeMinutes),
    cookTimeMinutes: positiveInteger(recipe.cookTimeMinutes),
    servings: positiveInteger(recipe.servings),
    difficulty: cleanText(recipe.difficulty),
    substitutions: cleanList(recipe.substitutions),
    dietaryNotes: cleanList(recipe.dietaryNotes),
    allergyNotes: cleanList(recipe.allergyNotes),
    foodSafetyNotes: cleanList(recipe.foodSafetyNotes),
    confidenceNotes: cleanText(recipe.confidenceNotes),
    source: cleanText(recipe.source) || "ai",
    provider: cleanText(recipe.provider),
    model: cleanText(recipe.model),
    createdAt: cleanText(recipe.createdAt),
  };
}

export function recipeMetaItems(recipe) {
  return [
    recipe.prepTimeMinutes !== null ? `Prep ${recipe.prepTimeMinutes} min` : "",
    recipe.cookTimeMinutes !== null ? `Cook ${recipe.cookTimeMinutes} min` : "",
    recipe.servings !== null ? `Serves ${recipe.servings}` : "",
    recipe.difficulty ? titleCase(recipe.difficulty) : "",
  ].filter(Boolean);
}

export function recipeSourceLabel(recipe) {
  if (recipe.source === "fallback") {
    return "Fallback output";
  }

  return [recipe.provider || "AI", recipe.model].filter(Boolean).join(" ");
}

function cleanList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(cleanText).filter(Boolean);
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function positiveInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function titleCase(value) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
