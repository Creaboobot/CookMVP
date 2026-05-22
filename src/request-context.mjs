import { readCookooiFeatureFlags } from "./feature-flags.mjs";

export const identityStates = Object.freeze({
  anonymous: "anonymous",
  authenticated: "authenticated",
});

export const authRoles = Object.freeze({
  user: "user",
  moderator: "moderator",
  admin: "admin",
  support: "support",
});

export const authorizationReasons = Object.freeze({
  allowed: "allowed",
  authenticationRequired: "authentication_required",
  ownerRequired: "owner_required",
  moderatorRoleRequired: "moderator_role_required",
  publicRecipeNotPublished: "public_recipe_not_published",
});

const allowedAuthorization = Object.freeze({ allowed: true, reason: authorizationReasons.allowed });
const allowedRoles = new Set(Object.values(authRoles));

export function createRequestContext(request, env = {}, options = {}) {
  const now = typeof options.now === "function" ? options.now() : Date.now();
  const startedAt = new Date(now).toISOString();
  const sessionId = cleanText(request.headers.get("x-cookooi-session")).slice(0, 160);
  const identity = normalizeVerifiedIdentity(options.verifiedIdentity);

  return Object.freeze({
    requestId: cleanText(request.headers.get("x-request-id")) || randomId(),
    startedAt,
    sessionId,
    identity,
    featureFlags: readCookooiFeatureFlags(env),
  });
}

export function createAnonymousIdentity() {
  return Object.freeze({
    state: identityStates.anonymous,
    userId: null,
    roles: Object.freeze([]),
  });
}

export function createAuthenticatedIdentity(identity = {}) {
  const userId = cleanText(identity.userId).slice(0, 160);
  if (!userId) {
    throw new Error("Authenticated Cookooi identity requires a server-verified user id.");
  }

  return Object.freeze({
    state: identityStates.authenticated,
    userId,
    roles: Object.freeze(normalizeRoles(identity.roles)),
  });
}

export function isAuthenticated(context) {
  return (
    context?.identity?.state === identityStates.authenticated &&
    typeof context.identity.userId === "string" &&
    context.identity.userId.length > 0
  );
}

export function hasRole(context, role) {
  return isAuthenticated(context) && Array.isArray(context.identity.roles) && context.identity.roles.includes(role);
}

export function authorizePrivateResourceAccess(context, ownerUserId) {
  if (!isAuthenticated(context)) {
    return denied(authorizationReasons.authenticationRequired);
  }
  if (cleanText(ownerUserId) !== context.identity.userId) {
    return denied(authorizationReasons.ownerRequired);
  }
  return allowedAuthorization;
}

export function authorizePrivateResourceWrite(context, ownerUserId = context?.identity?.userId) {
  return authorizePrivateResourceAccess(context, ownerUserId);
}

export function authorizePublicRecipeRead(context, publicRecipe = {}) {
  const status = cleanText(publicRecipe.status);
  if (status === "published") {
    return allowedAuthorization;
  }

  const ownerUserId = cleanText(publicRecipe.ownerUserId || publicRecipe.owner_user_id);
  if (ownerUserId && isAuthenticated(context) && ownerUserId === context.identity.userId) {
    return allowedAuthorization;
  }
  if (canModerateCommunityContent(context)) {
    return allowedAuthorization;
  }

  return denied(authorizationReasons.publicRecipeNotPublished);
}

export function authorizePublicRecipePublication(context) {
  if (!isAuthenticated(context)) {
    return denied(authorizationReasons.authenticationRequired);
  }
  return allowedAuthorization;
}

export function authorizeCommunityInteraction(context) {
  if (!isAuthenticated(context)) {
    return denied(authorizationReasons.authenticationRequired);
  }
  return allowedAuthorization;
}

export function authorizeModerationAction(context) {
  if (!canModerateCommunityContent(context)) {
    return denied(isAuthenticated(context) ? authorizationReasons.moderatorRoleRequired : authorizationReasons.authenticationRequired);
  }
  return allowedAuthorization;
}

export function canModerateCommunityContent(context) {
  return hasRole(context, authRoles.moderator) || hasRole(context, authRoles.admin) || hasRole(context, authRoles.support);
}

function randomId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `request-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeVerifiedIdentity(verifiedIdentity) {
  if (!verifiedIdentity || typeof verifiedIdentity !== "object" || Array.isArray(verifiedIdentity)) {
    return createAnonymousIdentity();
  }
  if (verifiedIdentity.state === identityStates.anonymous) {
    return createAnonymousIdentity();
  }
  if (verifiedIdentity.userId) {
    return createAuthenticatedIdentity(verifiedIdentity);
  }
  return createAnonymousIdentity();
}

function normalizeRoles(roles) {
  const normalized = Array.isArray(roles)
    ? roles.map((role) => cleanText(role).toLowerCase()).filter((role) => allowedRoles.has(role))
    : [];
  return [...new Set([authRoles.user, ...normalized])];
}

function denied(reason) {
  return Object.freeze({ allowed: false, reason });
}
