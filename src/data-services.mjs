import {
  accountStorageEnabled,
  communityInteractionsEnabled,
  publicRecipesEnabled,
  readCookooiFeatureFlags,
} from "./feature-flags.mjs";
import {
  authorizeCommunityInteraction,
  authorizePublicRecipePublication,
  authorizationReasons,
  isAuthenticated,
} from "./request-context.mjs";

const disabledResult = Object.freeze({ stored: false, reason: "feature_disabled" });
const missingAdapterResult = Object.freeze({ stored: false, reason: "backend_adapter_missing" });
const authRequiredResult = Object.freeze({ stored: false, reason: authorizationReasons.authenticationRequired });

export function createDataServices({ env = {}, adapters = {} } = {}) {
  const featureFlags = readCookooiFeatureFlags(env);

  return Object.freeze({
    featureFlags,
    userProfiles: Object.freeze({
      getCurrentProfile: (context) => guardedPrivateRead(featureFlags, adapters.userProfiles?.getCurrentProfile, [context], null),
      upsertProfile: (context, profile) =>
        guardedPrivateWrite(featureFlags, adapters.userProfiles?.upsertProfile, [context, profile]),
    }),
    recipeRequests: Object.freeze({
      recordRecipeRequest: (context, recipeRequest, metadata = {}) =>
        guardedPrivateWrite(featureFlags, adapters.recipeRequests?.recordRecipeRequest, [
          context,
          recipeRequest,
          metadata,
        ]),
    }),
    savedRecipes: Object.freeze({
      listSavedRecipes: (context) => guardedPrivateRead(featureFlags, adapters.savedRecipes?.listSavedRecipes, [context], []),
      saveRecipe: (context, savedRecipe) =>
        guardedPrivateWrite(featureFlags, adapters.savedRecipes?.saveRecipe, [context, savedRecipe]),
    }),
    followUpRequests: Object.freeze({
      recordFollowUpRequest: (context, followUpRequest, metadata = {}) =>
        guardedPrivateWrite(featureFlags, adapters.followUpRequests?.recordFollowUpRequest, [
          context,
          followUpRequest,
          metadata,
        ]),
    }),
    voiceNotes: Object.freeze({
      recordTranscriptionMetadata: (context, transcriptionMetadata) =>
        guardedPrivateWrite(featureFlags, adapters.voiceNotes?.recordTranscriptionMetadata, [
          context,
          transcriptionMetadata,
        ]),
    }),
    feedbackEvents: Object.freeze({
      recordFeedbackEvent: (context, feedbackEvent) =>
        guardedPrivateWrite(featureFlags, adapters.feedbackEvents?.recordFeedbackEvent, [context, feedbackEvent]),
    }),
    publicRecipes: Object.freeze({
      listPublicRecipes: (context, query = {}) =>
        guardedPublicRead(featureFlags, adapters.publicRecipes?.listPublicRecipes, [context, query], []),
      publishRecipe: (context, publicationRequest) =>
        guardedAuthorizedWrite(
          featureFlags,
          "public",
          adapters.publicRecipes?.publishRecipe,
          [context, publicationRequest],
          authorizePublicRecipePublication(context),
        ),
    }),
    interactions: Object.freeze({
      recordLike: (context, publicRecipeId) =>
        guardedAuthorizedWrite(
          featureFlags,
          "community",
          adapters.interactions?.recordLike,
          [context, publicRecipeId],
          authorizeCommunityInteraction(context),
        ),
      recordBookmark: (context, publicRecipeId) =>
        guardedAuthorizedWrite(
          featureFlags,
          "community",
          adapters.interactions?.recordBookmark,
          [context, publicRecipeId],
          authorizeCommunityInteraction(context),
        ),
      recordReport: (context, report) =>
        guardedAuthorizedWrite(
          featureFlags,
          "community",
          adapters.interactions?.recordReport,
          [context, report],
          authorizeCommunityInteraction(context),
        ),
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

function guardedPrivateRead(featureFlags, adapter, args, fallback) {
  if (!gateOpen(featureFlags, "account")) {
    return fallback;
  }
  if (!isAuthenticated(args[0])) {
    return fallback;
  }
  if (typeof adapter !== "function") {
    return fallback;
  }
  return adapter(...args);
}

function guardedPrivateWrite(featureFlags, adapter, args) {
  if (!gateOpen(featureFlags, "account")) {
    return disabledResult;
  }
  if (!isAuthenticated(args[0])) {
    return authRequiredResult;
  }
  if (typeof adapter !== "function") {
    return missingAdapterResult;
  }
  return adapter(...args);
}

function guardedPublicRead(featureFlags, adapter, args, fallback) {
  return guardedRead(featureFlags, "public", adapter, args, fallback);
}

function guardedAuthorizedWrite(featureFlags, gate, adapter, args, authorization) {
  if (!gateOpen(featureFlags, gate)) {
    return disabledResult;
  }
  if (!authorization.allowed) {
    return { stored: false, reason: authorization.reason };
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
