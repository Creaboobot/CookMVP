const accountFlag = "COOKOOI_ACCOUNTS_ENABLED";
const serverLibraryFlag = "COOKOOI_SERVER_LIBRARY_ENABLED";
const publicRecipesFlag = "COOKOOI_PUBLIC_RECIPES_ENABLED";
const communitySignalsFlag = "COOKOOI_COMMUNITY_SIGNALS_ENABLED";

export const featureFlagNames = Object.freeze({
  accounts: accountFlag,
  serverLibrary: serverLibraryFlag,
  publicRecipes: publicRecipesFlag,
  communitySignals: communitySignalsFlag,
});

export function readCookooiFeatureFlags(env = {}) {
  return Object.freeze({
    accounts: enabled(env[accountFlag]),
    serverLibrary: enabled(env[serverLibraryFlag]),
    publicRecipes: enabled(env[publicRecipesFlag]),
    communitySignals: enabled(env[communitySignalsFlag]),
  });
}

export function accountStorageEnabled(featureFlags) {
  return Boolean(featureFlags?.accounts && featureFlags?.serverLibrary);
}

export function publicRecipesEnabled(featureFlags) {
  return Boolean(featureFlags?.accounts && featureFlags?.publicRecipes);
}

export function communityInteractionsEnabled(featureFlags) {
  return Boolean(featureFlags?.accounts && featureFlags?.publicRecipes && featureFlags?.communitySignals);
}

function enabled(value) {
  return String(value || "").trim().toLowerCase() === "true";
}
