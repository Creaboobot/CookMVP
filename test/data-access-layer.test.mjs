import test from "node:test";
import assert from "node:assert/strict";
import { createDataServices } from "../src/data-services.mjs";
import {
  accountStorageEnabled,
  communityInteractionsEnabled,
  publicRecipesEnabled,
  readCookooiFeatureFlags,
} from "../src/feature-flags.mjs";
import {
  authRoles,
  authorizeCommunityInteraction,
  authorizeModerationAction,
  authorizePrivateResourceAccess,
  authorizePublicRecipeRead,
  authorizationReasons,
  createAuthenticatedIdentity,
  createRequestContext,
  isAuthenticated,
} from "../src/request-context.mjs";
import { handleGenerateRecipeRequest, handleRefineRecipeRequest, handleTranscribeVoiceRequest } from "../src/recipe-api.mjs";
import { createLocalOnlyDataServices } from "../public/local-data-services.js";

test("Cookooi account and community feature flags default off", () => {
  const flags = readCookooiFeatureFlags();

  assert.equal(flags.accounts, false);
  assert.equal(flags.serverLibrary, false);
  assert.equal(flags.publicRecipes, false);
  assert.equal(flags.communitySignals, false);
  assert.equal(accountStorageEnabled(flags), false);
  assert.equal(publicRecipesEnabled(flags), false);
  assert.equal(communityInteractionsEnabled(flags), false);
});

test("data services are disabled by default for future backend work", async () => {
  const services = createDataServices();
  const context = testContext();

  assert.equal(await services.userProfiles.getCurrentProfile(context), null);
  assert.deepEqual(await services.recipeRequests.recordRecipeRequest(context, { ingredientsText: "eggs" }), {
    stored: false,
    reason: "feature_disabled",
  });
  assert.deepEqual(await services.savedRecipes.listSavedRecipes(context), []);
  assert.deepEqual(await services.savedRecipes.saveRecipe(context, { title: "Rice" }), {
    stored: false,
    reason: "feature_disabled",
  });
  assert.deepEqual(await services.followUpRequests.recordFollowUpRequest(context, { question: "greens?" }), {
    stored: false,
    reason: "feature_disabled",
  });
  assert.deepEqual(await services.feedbackEvents.recordFeedbackEvent(context, { eventType: "rating" }), {
    stored: false,
    reason: "feature_disabled",
  });
  assert.deepEqual(await services.publicRecipes.listPublicRecipes(context), []);
  assert.deepEqual(await services.interactions.recordLike(context, "public-1"), {
    stored: false,
    reason: "feature_disabled",
  });
});

test("enabled feature gates call only the matching backend adapters", async () => {
  const calls = [];
  const services = createDataServices({
    env: enabledAccountAndCommunityEnv(),
    adapters: {
      userProfiles: {
        getCurrentProfile(context) {
          calls.push(["profile", context.identity.state]);
          return { displayName: "Tester" };
        },
      },
      recipeRequests: {
        recordRecipeRequest(_context, recipeRequest) {
          calls.push(["request", recipeRequest.ingredientsText]);
          return { stored: true, id: "request-1" };
        },
      },
      publicRecipes: {
        listPublicRecipes() {
          calls.push(["public"]);
          return [{ id: "public-1" }];
        },
      },
      interactions: {
        recordBookmark(_context, publicRecipeId) {
          calls.push(["bookmark", publicRecipeId]);
          return { stored: true };
        },
      },
    },
  });
  const context = authenticatedTestContext("user-1");

  assert.deepEqual(await services.userProfiles.getCurrentProfile(context), { displayName: "Tester" });
  assert.deepEqual(await services.recipeRequests.recordRecipeRequest(context, { ingredientsText: "rice" }), {
    stored: true,
    id: "request-1",
  });
  assert.deepEqual(await services.publicRecipes.listPublicRecipes(context), [{ id: "public-1" }]);
  assert.deepEqual(await services.interactions.recordBookmark(context, "public-1"), { stored: true });
  assert.deepEqual(calls, [
    ["profile", "authenticated"],
    ["request", "rice"],
    ["public"],
    ["bookmark", "public-1"],
  ]);
});

test("request context ignores client-supplied user ids and uses only verified server identity", () => {
  const context = createRequestContext(
    new Request("http://cookooi.test/api/recipes/generate", {
      headers: {
        "x-cookooi-session": " session-1 ",
        "x-cookooi-user-id": "client-spoof",
      },
    }),
    {},
    { now: () => Date.parse("2026-05-22T00:00:00.000Z") },
  );

  assert.equal(context.startedAt, "2026-05-22T00:00:00.000Z");
  assert.equal(context.sessionId, "session-1");
  assert.equal(context.identity.state, "anonymous");
  assert.equal(context.identity.userId, null);
  assert.equal(context.featureFlags.accounts, false);

  const verified = createRequestContext(
    new Request("http://cookooi.test/api/recipes/generate", {
      headers: {
        "x-cookooi-session": "session-2",
        "x-cookooi-user-id": "client-spoof",
      },
    }),
    {},
    {
      verifiedIdentity: { userId: "server-user-1", roles: ["moderator", "unknown-role"] },
    },
  );

  assert.equal(verified.identity.state, "authenticated");
  assert.equal(verified.identity.userId, "server-user-1");
  assert.deepEqual(verified.identity.roles, ["user", "moderator"]);
  assert.equal(isAuthenticated(verified), true);
});

test("authorization helpers keep private, public, and moderation rules distinct", () => {
  const anonymous = testContext();
  const owner = authenticatedTestContext("user-1");
  const otherUser = authenticatedTestContext("user-2");
  const moderator = {
    ...authenticatedTestContext("moderator-1"),
    identity: createAuthenticatedIdentity({ userId: "moderator-1", roles: [authRoles.moderator] }),
  };
  const admin = {
    ...authenticatedTestContext("admin-1"),
    identity: createAuthenticatedIdentity({ userId: "admin-1", roles: [authRoles.admin] }),
  };
  const support = {
    ...authenticatedTestContext("support-1"),
    identity: createAuthenticatedIdentity({ userId: "support-1", roles: [authRoles.support] }),
  };

  assert.deepEqual(authorizePrivateResourceAccess(anonymous, "user-1"), {
    allowed: false,
    reason: authorizationReasons.authenticationRequired,
  });
  assert.deepEqual(authorizePrivateResourceAccess(owner, "user-1"), {
    allowed: true,
    reason: authorizationReasons.allowed,
  });
  assert.deepEqual(authorizePrivateResourceAccess(otherUser, "user-1"), {
    allowed: false,
    reason: authorizationReasons.ownerRequired,
  });
  assert.deepEqual(authorizePublicRecipeRead(anonymous, { status: "published" }), {
    allowed: true,
    reason: authorizationReasons.allowed,
  });
  assert.deepEqual(authorizePublicRecipeRead(anonymous, {}), {
    allowed: false,
    reason: authorizationReasons.publicRecipeNotPublished,
  });
  assert.deepEqual(authorizePublicRecipeRead(anonymous, { status: "archived" }), {
    allowed: false,
    reason: authorizationReasons.publicRecipeNotPublished,
  });
  assert.deepEqual(authorizePublicRecipeRead(otherUser, { status: "draft_publication", ownerUserId: "user-1" }), {
    allowed: false,
    reason: authorizationReasons.publicRecipeNotPublished,
  });
  assert.deepEqual(authorizePublicRecipeRead(owner, { status: "draft_publication", ownerUserId: "user-1" }), {
    allowed: true,
    reason: authorizationReasons.allowed,
  });
  assert.deepEqual(authorizePublicRecipeRead(owner, { ownerUserId: "user-1" }), {
    allowed: true,
    reason: authorizationReasons.allowed,
  });
  assert.deepEqual(authorizePublicRecipeRead(moderator, { status: "hidden", ownerUserId: "user-1" }), {
    allowed: true,
    reason: authorizationReasons.allowed,
  });
  assert.deepEqual(authorizePublicRecipeRead(admin, { status: "removed", ownerUserId: "user-1" }), {
    allowed: true,
    reason: authorizationReasons.allowed,
  });
  assert.deepEqual(authorizePublicRecipeRead(support, {}), {
    allowed: true,
    reason: authorizationReasons.allowed,
  });
  assert.deepEqual(authorizeModerationAction(owner), {
    allowed: false,
    reason: authorizationReasons.moderatorRoleRequired,
  });
  assert.deepEqual(authorizeModerationAction(moderator), {
    allowed: true,
    reason: authorizationReasons.allowed,
  });
});

test("enabled account and community writes require authenticated context", async () => {
  const calls = [];
  const services = createDataServices({
    env: enabledAccountAndCommunityEnv(),
    adapters: {
      recipeRequests: {
        recordRecipeRequest() {
          calls.push("request");
          return { stored: true };
        },
      },
      publicRecipes: {
        listPublicRecipes() {
          calls.push("public-list");
          return [{ id: "public-1", status: "published" }];
        },
        publishRecipe() {
          calls.push("publish");
          return { stored: true };
        },
      },
      interactions: {
        recordLike() {
          calls.push("like");
          return { stored: true };
        },
      },
    },
  });
  const anonymous = testContext();

  assert.deepEqual(await services.recipeRequests.recordRecipeRequest(anonymous, { ingredientsText: "rice" }), {
    stored: false,
    reason: authorizationReasons.authenticationRequired,
  });
  assert.deepEqual(await services.publicRecipes.listPublicRecipes(anonymous), [{ id: "public-1", status: "published" }]);
  assert.deepEqual(await services.publicRecipes.publishRecipe(anonymous, { savedRecipeId: "saved-1" }), {
    stored: false,
    reason: authorizationReasons.authenticationRequired,
  });
  assert.deepEqual(await services.interactions.recordLike(anonymous, "public-1"), {
    stored: false,
    reason: authorizationReasons.authenticationRequired,
  });
  assert.deepEqual(authorizeCommunityInteraction(anonymous), {
    allowed: false,
    reason: authorizationReasons.authenticationRequired,
  });
  assert.deepEqual(calls, ["public-list"]);
});

test("local-only services preserve saved recipes, settings, and feedback behavior", () => {
  const storage = createMemoryStorage();
  const services = createLocalOnlyDataServices(storage);
  const sessionId = "session-1";

  services.settings.save({
    avoid: "peanuts",
    diet: "vegetarian",
    mealType: "dinner",
    servings: 4,
    maxTotalTimeMinutes: 30,
    cuisineOrFlavor: "bright",
    equipment: ["oven"],
  });
  const generation = services.feedbackEvents.recordGenerationSuccess({
    sessionId,
    payload: { ingredientsText: "eggs, rice", craving: "dinner", constraints: {} },
    generation: { createdAt: "2026-05-22T00:00:00.000Z", source: "fallback" },
    recipes: [{ id: "recipe-1" }],
  });
  const saved = services.savedRecipes.saveRecipe({
    sessionId,
    generationId: generation.id,
    recipe: { id: "recipe-1", title: "Rice Bowl", summary: "Fast dinner.", source: "fallback" },
  });
  services.feedbackEvents.saveRecipeFeedback({
    recipe: saved.recipe,
    rating: "up",
    note: "Useful.",
  });

  assert.equal(services.savedRecipes.isRecipeSaved(saved.recipe), true);
  assert.equal(services.savedRecipes.listSavedRecipes().length, 1);
  assert.deepEqual(services.settings.read(), {
    avoid: "peanuts",
    diet: "vegetarian",
    mealType: "dinner",
    servings: 4,
    maxTotalTimeMinutes: 30,
    cuisineOrFlavor: "bright",
    equipment: ["oven"],
  });
  assert.deepEqual(services.feedbackEvents.summary(), {
    generationCount: 1,
    refinementCount: 0,
    feedbackCount: 1,
    savedRecipeCount: 1,
  });
  assert.deepEqual(services.publicRecipes.listPublicRecipes(), []);
  assert.deepEqual(services.interactions.recordLike("public-1"), { stored: false, reason: "feature_disabled" });
});

test("disabled backend flags do not alter generation, follow-up, or voice route behavior", async () => {
  const throwingAdapters = {
    recipeRequests: {
      recordRecipeRequest() {
        throw new Error("must stay disabled");
      },
    },
    followUpRequests: {
      recordFollowUpRequest() {
        throw new Error("must stay disabled");
      },
    },
    voiceNotes: {
      recordTranscriptionMetadata() {
        throw new Error("must stay disabled");
      },
    },
  };

  const generation = await handleGenerateRecipeRequest(validRecipeRequest(), { COOKOOI_ENABLE_FALLBACK: "true" }, {
    dataAdapters: throwingAdapters,
  });
  const generationBody = await generation.json();
  assert.equal(generation.status, 200);
  assert.equal(generationBody.source, "fallback");
  assert.equal(generationBody.recipes.length, 3);

  const refinement = await handleRefineRecipeRequest(validRefinementRequest(), { COOKOOI_ENABLE_FALLBACK: "true" }, {
    dataAdapters: throwingAdapters,
  });
  const refinementBody = await refinement.json();
  assert.equal(refinement.status, 200);
  assert.equal(refinementBody.source, "fallback");
  assert.equal(refinementBody.refinement.feasibility, "use_caution");

  const voice = await handleTranscribeVoiceRequest(validAudioRequest(), { OPENAI_API_KEY: "test-key" }, {
    dataAdapters: throwingAdapters,
    fetcher: async () => Response.json({ text: "Eggs and rice for dinner." }),
  });
  const voiceBody = await voice.json();
  assert.equal(voice.status, 200);
  assert.equal(voiceBody.transcript, "Eggs and rice for dinner.");
});

function testContext() {
  return {
    identity: { state: "anonymous", userId: null, roles: [] },
    featureFlags: readCookooiFeatureFlags(),
    sessionId: "session-1",
  };
}

function authenticatedTestContext(userId) {
  return {
    identity: createAuthenticatedIdentity({ userId }),
    featureFlags: readCookooiFeatureFlags(enabledAccountAndCommunityEnv()),
    sessionId: "session-1",
  };
}

function enabledAccountAndCommunityEnv() {
  return {
    COOKOOI_ACCOUNTS_ENABLED: "true",
    COOKOOI_SERVER_LIBRARY_ENABLED: "true",
    COOKOOI_PUBLIC_RECIPES_ENABLED: "true",
    COOKOOI_COMMUNITY_SIGNALS_ENABLED: "true",
  };
}

function validRecipeRequest() {
  return new Request("http://cookooi.test/api/recipes/generate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-cookooi-session": "session-1" },
    body: JSON.stringify({
      ingredientsText: "eggs, rice, spinach",
      craving: "quick dinner",
    }),
  });
}

function validRefinementRequest() {
  return new Request("http://cookooi.test/api/recipes/refine", {
    method: "POST",
    headers: { "content-type": "application/json", "x-cookooi-session": "session-1" },
    body: JSON.stringify({
      recipe: {
        id: "recipe-1",
        title: "Potato Bacon Soup",
        summary: "A warm soup.",
        usesFromAvailableItems: ["potatoes", "bacon"],
        itemsStillNeeded: ["greens"],
        steps: ["Warm the pot.", "Cook bacon.", "Add potatoes.", "Simmer until tender."],
        prepTimeMinutes: 10,
        cookTimeMinutes: 30,
        servings: 2,
        difficulty: "easy",
        dietaryNotes: [],
        allergyNotes: ["Contains pork; check any allergy or diet restrictions."],
        foodSafetyNotes: ["Cook bacon thoroughly."],
        substitutions: ["Use another smoked protein if needed."],
        confidenceNotes: "Works best with cooked potatoes.",
      },
      question: "Can I add greens to this potato soup with bacon?",
    }),
  });
}

function validAudioRequest() {
  const formData = new FormData();
  formData.set("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), "voice-note.webm");
  return new Request("http://cookooi.test/api/voice/transcribe", {
    method: "POST",
    headers: { "x-cookooi-session": "session-1" },
    body: formData,
  });
}

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
