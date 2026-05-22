export const consentActions = Object.freeze({
  accountImport: "account_import",
  savedRecipePublication: "saved_recipe_publication",
  accountDataExport: "account_data_export",
  accountDeletion: "account_deletion",
});

export const dataRetentionPolicy = deepFreeze({
  rawVoiceAudio: {
    zone: "transient_processing",
    defaultRetention: "not_retained",
    requiresConsentForPersistence: true,
  },
  voiceTranscript: {
    zone: "private_account_data",
    defaultRetention: "not_persisted_in_current_mvp",
    futureMaximumRetentionDays: 30,
    requiresConsentForPersistence: true,
  },
  recipeRequest: {
    zone: "private_account_data",
    defaultRetention: "until_user_delete_or_account_delete",
    anonymousMigrationWindowDays: 30,
  },
  savedRecipe: {
    zone: "private_account_data",
    defaultRetention: "until_user_delete_or_account_delete",
  },
  feedbackAnalytics: {
    zone: "privacy_safe_metadata",
    defaultRetentionDays: 180,
    rawTextAllowed: false,
  },
  publicRecipe: {
    zone: "sanitized_public_data",
    defaultRetention: "until_unpublished_removed_or_account_delete",
    requiresExplicitPublicationConsent: true,
  },
  auditEvent: {
    zone: "operational_audit",
    defaultRetentionDays: 365,
    rawSensitiveTextAllowed: false,
  },
});

export const publicRecipeAllowedFields = Object.freeze([
  "title",
  "summary",
  "usesFromAvailableItems",
  "itemsStillNeeded",
  "steps",
  "prepTimeMinutes",
  "cookTimeMinutes",
  "servings",
  "difficulty",
  "dietaryNotes",
  "allergyNotes",
  "foodSafetyNotes",
  "substitutions",
]);

export const privateFieldsBlockedFromPublicRecipes = Object.freeze([
  "allergies",
  "anonymousSessionId",
  "avoid",
  "constraints",
  "craving",
  "followUpQuestion",
  "householdDetails",
  "ingredientsText",
  "privateNotes",
  "providerError",
  "rawAudio",
  "rawIngredientsText",
  "rawPrompt",
  "rawTranscript",
  "requestPrompt",
  "transcript",
  "validationFailure",
  "voiceTranscript",
]);

export const analyticsSafeEventFields = Object.freeze([
  "eventType",
  "schemaVersion",
  "sessionId",
  "recipeId",
  "generationId",
  "source",
  "provider",
  "model",
  "success",
  "recipeCount",
  "followUpCount",
  "feedbackRating",
  "noteLength",
  "ingredientsCount",
  "cravingLength",
  "avoidLength",
  "transcriptLength",
  "selectedDiet",
  "selectedMealType",
  "servings",
  "maxTotalTimeMinutes",
  "equipmentCount",
  "createdAt",
]);

export const analyticsBlockedRawFields = Object.freeze([
  "allergies",
  "avoid",
  "craving",
  "feedbackNote",
  "followUpQuestion",
  "ingredientsText",
  "privateNotes",
  "rawAudio",
  "rawPrompt",
  "rawTranscript",
  "transcript",
  "voiceTranscript",
]);

const allowedPublicFieldSet = new Set(publicRecipeAllowedFields);
const safeAnalyticsFieldSet = new Set(analyticsSafeEventFields);

export function requiresExplicitConsent(action) {
  return Object.values(consentActions).includes(action);
}

export function isPublicRecipeFieldAllowed(fieldName) {
  return allowedPublicFieldSet.has(fieldName);
}

export function sanitizePublicRecipeDraft(recipe = {}) {
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
    return {};
  }

  const sanitized = {};
  for (const fieldName of publicRecipeAllowedFields) {
    if (fieldName in recipe) {
      sanitized[fieldName] = normalizePublicValue(recipe[fieldName]);
    }
  }
  return sanitized;
}

export function createPrivacySafeAnalyticsEvent(event = {}) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return {};
  }

  const safeEvent = {};
  for (const [fieldName, value] of Object.entries(event)) {
    if (safeAnalyticsFieldSet.has(fieldName)) {
      const normalizedValue = normalizeAnalyticsValue(value);
      if (normalizedValue !== undefined) {
        safeEvent[fieldName] = normalizedValue;
      }
    }
  }
  return safeEvent;
}

function normalizePublicValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizePublicValue).filter((item) => item !== "" && item !== null && item !== undefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([fieldName]) => isPublicRecipeFieldAllowed(fieldName))
        .map(([fieldName, nestedValue]) => [fieldName, normalizePublicValue(nestedValue)]),
    );
  }
  if (typeof value === "string") {
    return cleanText(value);
  }
  return value;
}

function normalizeAnalyticsValue(value) {
  if (typeof value === "string") {
    return cleanText(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  return undefined;
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}
