import { readCookooiFeatureFlags } from "./feature-flags.mjs";

export function createRequestContext(request, env = {}, options = {}) {
  const now = typeof options.now === "function" ? options.now() : Date.now();
  const startedAt = new Date(now).toISOString();
  const sessionId = cleanText(request.headers.get("x-cookooi-session")).slice(0, 160);

  return Object.freeze({
    requestId: cleanText(request.headers.get("x-request-id")) || randomId(),
    startedAt,
    sessionId,
    identity: Object.freeze({
      state: "anonymous",
      userId: null,
      roles: Object.freeze([]),
    }),
    featureFlags: readCookooiFeatureFlags(env),
  });
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
