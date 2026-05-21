const feedbackDataKey = "cookooi-feedback-v1";
const sessionKey = "cookooi-session-v1";
const feedbackVersion = 1;
const maxFeedbackNoteChars = 500;
const maxStoredGenerations = 100;
const maxStoredFeedbackItems = 300;
const maxStoredRefinements = 100;

export function getSessionId(storage = browserStorage()) {
  const existing = cleanText(storage.getItem(sessionKey));
  if (existing) {
    return existing;
  }

  const sessionId = createSessionId();
  storage.setItem(sessionKey, sessionId);
  return sessionId;
}

export function createSessionId(date = new Date(), randomValue = Math.random()) {
  const datePart = date.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const randomPart = Math.floor(randomValue * 0x100000000)
    .toString(16)
    .padStart(8, "0");

  return `cookooi-${datePart}-${randomPart}`;
}

export function readFeedbackData(storage = browserStorage()) {
  const sessionId = getSessionId(storage);
  const raw = storage.getItem(feedbackDataKey);

  if (!raw) {
    return emptyFeedbackData(sessionId);
  }

  try {
    return normalizeFeedbackData(JSON.parse(raw), sessionId);
  } catch {
    return emptyFeedbackData(sessionId);
  }
}

export function feedbackSummary(storage = browserStorage()) {
  const data = readFeedbackData(storage);

  return {
    generationCount: data.generations.length,
    feedbackCount: data.feedback.length,
    refinementCount: data.refinements.length,
    savedRecipeCount: data.savedRecipeIds.length,
  };
}

export function recordGenerationSuccess({ payload, generation, recipes, sessionId, storage = browserStorage() }) {
  const data = readFeedbackData(storage);
  const createdAt = cleanText(generation?.createdAt) || new Date().toISOString();
  const source = cleanText(generation?.source) || "ai";
  const record = {
    id: `generation-${createdAt}`,
    sessionId: cleanText(sessionId) || data.sessionId,
    createdAt,
    status: "success",
    source,
    fallback: source === "fallback",
    provider: cleanText(generation?.provider),
    model: cleanText(generation?.model),
    recipeIds: Array.isArray(recipes) ? recipes.map((recipe) => cleanText(recipe.id)).filter(Boolean) : [],
    recipeCount: Array.isArray(recipes) ? recipes.length : 0,
    savedRecipeIds: [],
    context: summarizeGenerationContext(payload),
  };

  data.generations = [record, ...data.generations.filter((item) => item.id !== record.id)].slice(0, maxStoredGenerations);
  writeFeedbackData(storage, data);

  return record;
}

export function recordGenerationFailure({ payload, error, sessionId, storage = browserStorage() }) {
  const data = readFeedbackData(storage);
  const createdAt = new Date().toISOString();
  const record = {
    id: `generation-${createdAt}`,
    sessionId: cleanText(sessionId) || data.sessionId,
    createdAt,
    status: "failure",
    source: "none",
    fallback: false,
    errorCode: cleanText(error?.code) || "unknown_error",
    retryable: Boolean(error?.retryable),
    context: summarizeGenerationContext(payload),
  };

  data.generations = [record, ...data.generations].slice(0, maxStoredGenerations);
  writeFeedbackData(storage, data);

  return record;
}

export function recordRefinementSuccess({ recipe, question, response, sessionId, storage = browserStorage() }) {
  const data = readFeedbackData(storage);
  const refinement = response?.refinement && typeof response.refinement === "object" ? response.refinement : {};
  const createdAt = cleanText(response?.createdAt) || new Date().toISOString();
  const source = cleanText(response?.source) || "ai";
  const record = {
    id: `refinement-${createdAt}`,
    sessionId: cleanText(sessionId) || data.sessionId,
    createdAt,
    status: "success",
    recipeId: cleanText(recipe?.id),
    recipeTitle: cleanText(recipe?.title),
    questionLength: cleanText(question).length,
    source,
    fallback: source === "fallback",
    provider: cleanText(response?.provider),
    model: cleanText(response?.model),
    feasibility: cleanSelectValue(refinement.feasibility),
    hasProposedVariant: Boolean(refinement.proposedVariant),
  };

  data.refinements = [record, ...data.refinements.filter((item) => item.id !== record.id)].slice(0, maxStoredRefinements);
  writeFeedbackData(storage, data);

  return record;
}

export function recordRefinementFailure({ recipe, question, error, sessionId, storage = browserStorage() }) {
  const data = readFeedbackData(storage);
  const createdAt = new Date().toISOString();
  const record = {
    id: `refinement-${createdAt}`,
    sessionId: cleanText(sessionId) || data.sessionId,
    createdAt,
    status: "failure",
    recipeId: cleanText(recipe?.id),
    recipeTitle: cleanText(recipe?.title),
    questionLength: cleanText(question).length,
    source: "none",
    fallback: false,
    errorCode: cleanText(error?.code) || "unknown_error",
    retryable: Boolean(error?.retryable),
  };

  data.refinements = [record, ...data.refinements].slice(0, maxStoredRefinements);
  writeFeedbackData(storage, data);

  return record;
}

export function getRecipeFeedback(recipeId, storage = browserStorage()) {
  const id = cleanText(recipeId);
  if (!id) {
    return null;
  }

  return readFeedbackData(storage).feedback.find((item) => item.recipeId === id) || null;
}

export function saveRecipeFeedback({ recipe, rating, note, storage = browserStorage() }) {
  const normalizedRating = cleanText(rating);
  if (!["up", "down"].includes(normalizedRating)) {
    throw new Error("Choose a recipe rating before saving feedback.");
  }

  const recipeId = cleanText(recipe?.id);
  if (!recipeId) {
    throw new Error("Feedback needs a recipe id.");
  }

  const data = readFeedbackData(storage);
  const generation = data.generations.find((item) => item.recipeIds.includes(recipeId));
  const feedback = {
    recipeId,
    recipeTitle: cleanText(recipe?.title),
    generationId: generation?.id || "",
    rating: normalizedRating,
    note: cleanText(note).slice(0, maxFeedbackNoteChars),
    source: cleanText(recipe?.source),
    updatedAt: new Date().toISOString(),
  };

  data.feedback = [feedback, ...data.feedback.filter((item) => item.recipeId !== recipeId)].slice(0, maxStoredFeedbackItems);
  writeFeedbackData(storage, data);

  return feedback;
}

export function markRecipeSaved(recipe, storage = browserStorage()) {
  const recipeId = cleanText(recipe?.id);
  if (!recipeId) {
    return readFeedbackData(storage);
  }

  const data = readFeedbackData(storage);

  if (!data.savedRecipeIds.includes(recipeId)) {
    data.savedRecipeIds = [recipeId, ...data.savedRecipeIds];
  }

  for (const generation of data.generations) {
    if (generation.recipeIds.includes(recipeId) && !generation.savedRecipeIds.includes(recipeId)) {
      generation.savedRecipeIds = [recipeId, ...generation.savedRecipeIds];
    }
  }

  writeFeedbackData(storage, data);
  return data;
}

export function clearFeedbackData(storage = browserStorage()) {
  storage.removeItem(feedbackDataKey);
}

export function exportFeedbackData(storage = browserStorage()) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      ...readFeedbackData(storage),
    },
    null,
    2,
  );
}

export function importFeedbackData(candidate, storage = browserStorage()) {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    candidate.version !== feedbackVersion ||
    !Array.isArray(candidate.generations) ||
    !Array.isArray(candidate.feedback)
  ) {
    throw new Error("Import must be Cookooi feedback JSON.");
  }

  const data = normalizeFeedbackData(candidate, getSessionId(storage));
  writeFeedbackData(storage, data);
  return data;
}

export function summarizeGenerationContext(payload = {}) {
  const constraints = payload.constraints && typeof payload.constraints === "object" ? payload.constraints : {};

  return {
    availableItemCount: countAvailableItems(payload.ingredientsText),
    cravingLength: cleanText(payload.craving).length,
    previousRecipeTitleCount: cleanTextList(payload.previousRecipeTitles).length,
    constraints: {
      hasAvoidances: Boolean(cleanText(constraints.avoid)),
      diet: cleanSelectValue(constraints.diet),
      mealType: cleanSelectValue(constraints.mealType),
      servings: positiveInteger(constraints.servings),
      maxTotalTimeMinutes: positiveInteger(constraints.maxTotalTimeMinutes),
      hasCuisineOrFlavor: Boolean(cleanText(constraints.cuisineOrFlavor)),
      equipment: cleanTextList(constraints.equipment),
    },
  };
}

function emptyFeedbackData(sessionId) {
  return {
    version: feedbackVersion,
    sessionId,
    generations: [],
    refinements: [],
    feedback: [],
    savedRecipeIds: [],
  };
}

function normalizeFeedbackData(value, fallbackSessionId) {
  return {
    version: feedbackVersion,
    sessionId: cleanText(value?.sessionId) || fallbackSessionId,
    generations: Array.isArray(value?.generations)
      ? value.generations.map(normalizeGenerationRecord).filter(Boolean).slice(0, maxStoredGenerations)
      : [],
    refinements: Array.isArray(value?.refinements)
      ? value.refinements.map(normalizeRefinementRecord).filter(Boolean).slice(0, maxStoredRefinements)
      : [],
    feedback: Array.isArray(value?.feedback)
      ? value.feedback.map(normalizeFeedbackRecord).filter(Boolean).slice(0, maxStoredFeedbackItems)
      : [],
    savedRecipeIds: cleanTextList(value?.savedRecipeIds),
  };
}

function normalizeGenerationRecord(record) {
  const id = cleanText(record?.id);
  const createdAt = cleanText(record?.createdAt);
  const status = cleanText(record?.status);

  if (!id || !createdAt || !["success", "failure"].includes(status)) {
    return null;
  }

  return {
    id,
    sessionId: cleanText(record.sessionId),
    createdAt,
    status,
    source: cleanText(record.source),
    fallback: Boolean(record.fallback),
    provider: cleanText(record.provider),
    model: cleanText(record.model),
    errorCode: cleanText(record.errorCode),
    retryable: Boolean(record.retryable),
    recipeIds: cleanTextList(record.recipeIds),
    recipeCount: positiveInteger(record.recipeCount) || 0,
    savedRecipeIds: cleanTextList(record.savedRecipeIds),
    context: normalizeContext(record.context),
  };
}

function normalizeRefinementRecord(record) {
  const id = cleanText(record?.id);
  const createdAt = cleanText(record?.createdAt);
  const status = cleanText(record?.status);

  if (!id || !createdAt || !["success", "failure"].includes(status)) {
    return null;
  }

  return {
    id,
    sessionId: cleanText(record.sessionId),
    createdAt,
    status,
    recipeId: cleanText(record.recipeId),
    recipeTitle: cleanText(record.recipeTitle),
    questionLength: positiveInteger(record.questionLength) || 0,
    source: cleanText(record.source),
    fallback: Boolean(record.fallback),
    provider: cleanText(record.provider),
    model: cleanText(record.model),
    feasibility: cleanSelectValue(record.feasibility),
    hasProposedVariant: Boolean(record.hasProposedVariant),
    errorCode: cleanText(record.errorCode),
    retryable: Boolean(record.retryable),
  };
}

function normalizeContext(context = {}) {
  return {
    availableItemCount: positiveInteger(context.availableItemCount) || 0,
    cravingLength: positiveInteger(context.cravingLength) || 0,
    previousRecipeTitleCount: positiveInteger(context.previousRecipeTitleCount) || 0,
    constraints: {
      hasAvoidances: Boolean(context.constraints?.hasAvoidances),
      diet: cleanSelectValue(context.constraints?.diet),
      mealType: cleanSelectValue(context.constraints?.mealType),
      servings: positiveInteger(context.constraints?.servings),
      maxTotalTimeMinutes: positiveInteger(context.constraints?.maxTotalTimeMinutes),
      hasCuisineOrFlavor: Boolean(context.constraints?.hasCuisineOrFlavor),
      equipment: cleanTextList(context.constraints?.equipment),
    },
  };
}

function normalizeFeedbackRecord(record) {
  const recipeId = cleanText(record?.recipeId);
  const rating = cleanText(record?.rating);

  if (!recipeId || !["up", "down"].includes(rating)) {
    return null;
  }

  return {
    recipeId,
    recipeTitle: cleanText(record.recipeTitle),
    generationId: cleanText(record.generationId),
    rating,
    note: cleanText(record.note).slice(0, maxFeedbackNoteChars),
    source: cleanText(record.source),
    updatedAt: cleanText(record.updatedAt) || new Date().toISOString(),
  };
}

function writeFeedbackData(storage, data) {
  storage.setItem(feedbackDataKey, JSON.stringify(normalizeFeedbackData(data, data.sessionId)));
}

function browserStorage() {
  return window.localStorage;
}

function countAvailableItems(value) {
  return cleanText(value)
    .split(/[\n,]+|\band\b/gi)
    .map(cleanText)
    .filter(Boolean).length;
}

function cleanTextList(value) {
  return Array.isArray(value) ? [...new Set(value.map(cleanText).filter(Boolean))] : [];
}

function cleanSelectValue(value) {
  const cleaned = cleanText(value);
  return cleaned && cleaned !== "none" ? cleaned : "";
}

function positiveInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
