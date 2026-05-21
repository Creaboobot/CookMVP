import { getSessionId, recordGenerationFailure, recordGenerationSuccess, recordRefinementFailure, recordRefinementSuccess, saveRecipeFeedback } from "./feedback-store.js";
import { readRecipeSettings, saveRecipeSettings } from "./settings-store.js";
import {
  isRecipeSaved,
  readSavedRecipeEntries,
  removeSavedRecipe,
  saveRecipeToLibrary,
  sessionSummary,
} from "./session-store.js";

const disabledResult = Object.freeze({ stored: false, reason: "feature_disabled" });

export function createLocalOnlyDataServices(storage = browserStorage()) {
  return Object.freeze({
    userProfiles: Object.freeze({
      getCurrentProfile: () => null,
      upsertProfile: () => disabledResult,
    }),
    recipeRequests: Object.freeze({
      recordRecipeRequest: () => disabledResult,
    }),
    settings: Object.freeze({
      read: () => readRecipeSettings(storage),
      save: (settings) => saveRecipeSettings(settings, storage),
    }),
    savedRecipes: Object.freeze({
      listSavedRecipes: () => readSavedRecipeEntries(storage),
      isRecipeSaved: (recipe) => isRecipeSaved(recipe, storage),
      saveRecipe: ({ recipe, sessionId, generationId }) =>
        saveRecipeToLibrary({ recipe, sessionId: sessionId || getSessionId(storage), generationId, storage }),
      removeRecipe: (recipeId) => removeSavedRecipe(recipeId, storage),
    }),
    followUpRequests: Object.freeze({
      recordFollowUpRequest: () => disabledResult,
    }),
    feedbackEvents: Object.freeze({
      recordGenerationSuccess: (event) => recordGenerationSuccess({ storage, ...event }),
      recordGenerationFailure: (event) => recordGenerationFailure({ storage, ...event }),
      recordRefinementSuccess: (event) => recordRefinementSuccess({ storage, ...event }),
      recordRefinementFailure: (event) => recordRefinementFailure({ storage, ...event }),
      saveRecipeFeedback: (event) => saveRecipeFeedback({ storage, ...event }),
      summary: () => sessionSummary(storage),
    }),
    publicRecipes: Object.freeze({
      listPublicRecipes: () => [],
      publishRecipe: () => disabledResult,
    }),
    interactions: Object.freeze({
      recordLike: () => disabledResult,
      recordBookmark: () => disabledResult,
      recordReport: () => disabledResult,
    }),
  });
}

function browserStorage() {
  return window.localStorage;
}
