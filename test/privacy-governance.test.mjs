import test from "node:test";
import assert from "node:assert/strict";
import {
  analyticsBlockedRawFields,
  createPrivacySafeAnalyticsEvent,
  dataRetentionPolicy,
  privateFieldsBlockedFromPublicRecipes,
  requiresExplicitConsent,
  sanitizePublicRecipeDraft,
  consentActions,
} from "../src/privacy-governance.mjs";

test("retention policy keeps raw audio transient and transcript persistence consented", () => {
  assert.equal(dataRetentionPolicy.rawVoiceAudio.defaultRetention, "not_retained");
  assert.equal(dataRetentionPolicy.rawVoiceAudio.requiresConsentForPersistence, true);
  assert.equal(dataRetentionPolicy.voiceTranscript.requiresConsentForPersistence, true);
  assert.equal(dataRetentionPolicy.voiceTranscript.futureMaximumRetentionDays, 30);
  assert.equal(dataRetentionPolicy.publicRecipe.requiresExplicitPublicationConsent, true);
  assert.equal(dataRetentionPolicy.feedbackAnalytics.rawTextAllowed, false);
});

test("publication and account data actions require explicit consent", () => {
  assert.equal(requiresExplicitConsent(consentActions.savedRecipePublication), true);
  assert.equal(requiresExplicitConsent(consentActions.accountImport), true);
  assert.equal(requiresExplicitConsent(consentActions.accountDataExport), true);
  assert.equal(requiresExplicitConsent(consentActions.accountDeletion), true);
  assert.equal(requiresExplicitConsent("save_private_recipe"), false);
  assert.equal(requiresExplicitConsent("rate_recipe"), false);
});

test("public recipe sanitizer drops private source context", () => {
  const sanitized = sanitizePublicRecipeDraft({
    title: "Rice Bowl",
    summary: "Fast dinner.",
    usesFromAvailableItems: ["rice", "spinach"],
    itemsStillNeeded: ["lemon"],
    steps: ["Warm rice.", "Add greens."],
    prepTimeMinutes: 5,
    cookTimeMinutes: 10,
    servings: 2,
    difficulty: "easy",
    dietaryNotes: ["Vegetarian if using vegetable broth."],
    allergyNotes: ["Contains dairy if topped with cheese."],
    foodSafetyNotes: ["Reheat rice thoroughly."],
    substitutions: ["Use quinoa."],
    rawPrompt: "I am allergic to peanuts and only have...",
    rawTranscript: "voice text with private details",
    transcript: "voice text with private details",
    privateNotes: "My household disliked this.",
    followUpQuestion: "Can I hide the spinach?",
    anonymousSessionId: "session-1",
    constraints: { avoid: "peanuts" },
    providerError: "debug details",
  });

  assert.deepEqual(Object.keys(sanitized), [
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
  for (const fieldName of privateFieldsBlockedFromPublicRecipes) {
    assert.equal(fieldName in sanitized, false, `${fieldName} must not be public`);
  }
});

test("analytics sanitizer keeps metadata and removes raw sensitive fields", () => {
  const safeEvent = createPrivacySafeAnalyticsEvent({
    eventType: "generation_success",
    schemaVersion: 1,
    sessionId: "session-1",
    recipeId: "recipe-1",
    source: "ai",
    provider: "openai",
    model: "gpt-test",
    success: true,
    recipeCount: 3,
    ingredientsCount: 4,
    cravingLength: 12,
    avoidLength: 7,
    transcriptLength: 48,
    equipmentCount: 2,
    createdAt: "2026-05-22T00:00:00.000Z",
    ingredientsText: "rice, spinach, eggs",
    craving: "private craving",
    avoid: "private avoidances",
    transcript: "raw transcript",
    rawPrompt: "raw prompt",
    followUpQuestion: "private follow-up",
    feedbackNote: "free-text note",
    privateNotes: "private saved recipe note",
  });

  assert.deepEqual(safeEvent, {
    eventType: "generation_success",
    schemaVersion: 1,
    sessionId: "session-1",
    recipeId: "recipe-1",
    source: "ai",
    provider: "openai",
    model: "gpt-test",
    success: true,
    recipeCount: 3,
    ingredientsCount: 4,
    cravingLength: 12,
    avoidLength: 7,
    transcriptLength: 48,
    equipmentCount: 2,
    createdAt: "2026-05-22T00:00:00.000Z",
  });
  for (const fieldName of analyticsBlockedRawFields) {
    assert.equal(fieldName in safeEvent, false, `${fieldName} must not be in analytics`);
  }
});
