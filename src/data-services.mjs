import {
  accountStorageEnabled,
  communityInteractionsEnabled,
  publicRecipesEnabled,
  readCookooiFeatureFlags,
} from "./feature-flags.mjs";

const disabledResult = Object.freeze({ stored: false, reason: "feature_disabled" });
const missingAdapterResult = Object.freeze({ stored: false, reason: "backend_adapter_missing" });

export function createDataServices({ env = {}, adapters = {} } = {}) {
  const featureFlags = readCookooiFeatureFlags(env);

  return Object.freeze({
    featureFlags,
    userProfiles: Object.freeze({
      getCurrentProfile: (context) => guardedRead(featureFlags, "account", adapters.userProfiles?.getCurrentProfile, [context], null),
      upsertProfile: (context, profile) =>
        guardedWrite(featureFlags, "account", adapters.userProfiles?.upsertProfile, [context, profile]),
    }),
    recipeRequests: Object.freeze({
      recordRecipeRequest: (context, recipeRequest, metadata = {}) =>
        guardedWrite(featureFlags, "account", adapters.recipeRequests?.recordRecipeRequest, [
          context,
          recipeRequest,
          metadata,
        ]),
    }),
    savedRecipes: Object.freeze({
      listSavedRecipes: (context) => guardedRead(featureFlags, "account", adapters.savedRecipes?.listSavedRecipes, [context], []),
      saveRecipe: (context, savedRecipe) =>
        guardedWrite(featureFlags, "account", adapters.savedRecipes?.saveRecipe, [context, savedRecipe]),
    }),
    followUpRequests: Object.freeze({
      recordFollowUpRequest: (context, followUpRequest, metadata = {}) =>
        guardedWrite(featureFlags, "account", adapters.followUpRequests?.recordFollowUpRequest, [
          context,
          followUpRequest,
          metadata,
        ]),
    }),
    voiceNotes: Object.freeze({
      recordTranscriptionMetadata: (context, transcriptionMetadata) =>
        guardedWrite(featureFlags, "account", adapters.voiceNotes?.recordTranscriptionMetadata, [
          context,
          transcriptionMetadata,
        ]),
    }),
    feedbackEvents: Object.freeze({
      recordFeedbackEvent: (context, feedbackEvent) =>
        guardedWrite(featureFlags, "account", adapters.feedbackEvents?.recordFeedbackEvent, [context, feedbackEvent]),
    }),
    publicRecipes: Object.freeze({
      listPublicRecipes: (context, query = {}) =>
        guardedRead(featureFlags, "public", adapters.publicRecipes?.listPublicRecipes, [context, query], []),
      publishRecipe: (context, publicationRequest) =>
        guardedWrite(featureFlags, "public", adapters.publicRecipes?.publishRecipe, [context, publicationRequest]),
    }),
    interactions: Object.freeze({
      recordLike: (context, publicRecipeId) =>
        guardedWrite(featureFlags, "community", adapters.interactions?.recordLike, [context, publicRecipeId]),
      recordBookmark: (context, publicRecipeId) =>
        guardedWrite(featureFlags, "community", adapters.interactions?.recordBookmark, [context, publicRecipeId]),
      recordReport: (context, report) =>
        guardedWrite(featureFlags, "community", adapters.interactions?.recordReport, [context, report]),
    }),
  });
}

export async function safelyRecordDataService(operation) {
  try {
    return await operation();
  } catch {
    return { stored: false, reason: "adapter_error" };
  }
}

function guardedRead(featureFlags, gate, adapter, args, fallback) {
  if (!gateOpen(featureFlags, gate)) {
    return fallback;
  }
  if (typeof adapter !== "function") {
    return fallback;
  }
  return adapter(...args);
}

function guardedWrite(featureFlags, gate, adapter, args) {
  if (!gateOpen(featureFlags, gate)) {
    return disabledResult;
  }
  if (typeof adapter !== "function") {
    return missingAdapterResult;
  }
  return adapter(...args);
}

function gateOpen(featureFlags, gate) {
  if (gate === "account") {
    return accountStorageEnabled(featureFlags);
  }
  if (gate === "public") {
    return publicRecipesEnabled(featureFlags);
  }
  if (gate === "community") {
    return communityInteractionsEnabled(featureFlags);
  }
  return false;
}
