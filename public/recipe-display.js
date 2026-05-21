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

export function recipeOverviewCountLabel(recipe) {
  const usedCount = Array.isArray(recipe?.usesFromAvailableItems) ? recipe.usesFromAvailableItems.length : 0;
  const missingCount = Array.isArray(recipe?.itemsStillNeeded) ? recipe.itemsStillNeeded.length : 0;
  const usedLabel = `${usedCount} item${usedCount === 1 ? "" : "s"} used`;
  const missingLabel = `${missingCount} item${missingCount === 1 ? "" : "s"} still needed`;

  return `${usedLabel} - ${missingLabel}`;
}

export function recipeSourceLabel(recipe) {
  if (recipe.source === "fallback") {
    return "Fallback output, not AI-generated";
  }

  return [recipe.provider || "AI", recipe.model].filter(Boolean).join(" ");
}

export function normalizeRefinementForDisplay(response = {}) {
  const refinement = response.refinement && typeof response.refinement === "object" ? response.refinement : {};
  const proposedVariant =
    refinement.proposedVariant && typeof refinement.proposedVariant === "object"
      ? normalizeRecipeForDisplay({
          ...refinement.proposedVariant,
          type: "Suggested adjustment",
          source: response.source,
          provider: response.provider,
          model: response.model,
          createdAt: response.createdAt,
        })
      : null;

  return {
    feasibility: refinementFeasibility(refinement.feasibility),
    explanation: cleanText(refinement.explanation),
    modifiedIngredients: cleanList(refinement.modifiedIngredients),
    modifiedSteps: cleanList(refinement.modifiedSteps),
    allergyNotes: cleanList(refinement.allergyNotes),
    foodSafetyNotes: cleanList(refinement.foodSafetyNotes),
    confidenceNotes: cleanText(refinement.confidenceNotes),
    proposedVariant,
    source: cleanText(response.source) || "ai",
    provider: cleanText(response.provider),
    model: cleanText(response.model),
    createdAt: cleanText(response.createdAt),
    warning: cleanText(response.warning),
  };
}

export function refinementFeasibilityLabel(feasibility) {
  const labels = {
    works: "Works",
    use_caution: "Use caution",
    not_recommended: "Not recommended",
  };

  return labels[refinementFeasibility(feasibility)];
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

function refinementFeasibility(value) {
  return ["works", "use_caution", "not_recommended"].includes(value) ? value : "use_caution";
}
