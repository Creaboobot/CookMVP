const DEFAULT_LOCAL_ROUTE = "http://127.0.0.1:3004";
const DEFAULT_PUBLIC_ROUTE = "https://cookooi.creabooboard.win";
const DEFAULT_RECIPE_MODEL = "gpt-5.4-mini";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 20;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export function createOperationsHealth(env = {}, options = {}) {
  const hasOpenAiKey = hasValue(env.OPENAI_API_KEY);
  const fallbackEnabled = env.COOKOOI_ENABLE_FALLBACK === "true";
  const recipeModel = hasValue(env.OPENAI_MODEL) ? env.OPENAI_MODEL.trim() : DEFAULT_RECIPE_MODEL;
  const transcriptionModel = hasValue(env.OPENAI_TRANSCRIPTION_MODEL)
    ? env.OPENAI_TRANSCRIPTION_MODEL.trim()
    : DEFAULT_TRANSCRIPTION_MODEL;
  const rateLimitMaxRequests = positiveInteger(env.COOKOOI_RATE_LIMIT_MAX_REQUESTS, DEFAULT_RATE_LIMIT_MAX_REQUESTS);
  const rateLimitWindowMs = positiveInteger(env.COOKOOI_RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS);
  const localRoute = hasValue(env.COOKOOI_LOCAL_ROUTE) ? env.COOKOOI_LOCAL_ROUTE.trim() : DEFAULT_LOCAL_ROUTE;
  const publicRoute = hasValue(env.COOKOOI_PUBLIC_ROUTE) ? env.COOKOOI_PUBLIC_ROUTE.trim() : DEFAULT_PUBLIC_ROUTE;

  const checks = {
    service_route: {
      status: "ready",
      detail: "Health endpoint is responding.",
    },
    public_route: {
      status: "manual_check_required",
      target: publicRoute,
      detail: "Confirm the public route separately with GET / and GET /api/health before inviting testers.",
    },
    recipe_generation: {
      status: hasOpenAiKey ? "ready" : fallbackEnabled ? "fallback_only" : "configuration_needed",
      endpoint: "POST /api/recipes/generate",
      model: recipeModel,
      fallbackEnabled,
      detail: hasOpenAiKey
        ? "OpenAI-backed generation is configured server-side."
        : fallbackEnabled
          ? "Local deterministic fallback is enabled; this is not a provider-backed public test."
          : "Set OPENAI_API_KEY server-side or enable COOKOOI_ENABLE_FALLBACK=true for local fallback testing.",
    },
    voice_transcription: {
      status: hasOpenAiKey ? "ready" : "configuration_needed",
      endpoint: "POST /api/voice/transcribe",
      model: transcriptionModel,
      detail: hasOpenAiKey
        ? "Voice transcription can call the configured server-side OpenAI key."
        : "Voice transcription needs OPENAI_API_KEY; testers can still paste text in the transcript field.",
    },
    feedback_capture: {
      status: "ready",
      mode: "browser_local",
      storageKey: "cookooi-feedback-v1",
      detail: "Feedback remains browser-local and exportable through the session JSON workflow.",
    },
    privacy_safe_logging: {
      status: "ready",
      detail: "Operational logs should use categories and metadata only, not raw ingredients, prompts, transcripts, avoidances, or notes.",
    },
    rate_limits: {
      status: "ready",
      maxRequests: rateLimitMaxRequests,
      windowMs: rateLimitWindowMs,
      detail: "Anonymous testing uses request buckets; future account work should add per-user and per-session budgets.",
    },
  };

  const readyForLocalFallbackTesting = hasOpenAiKey || fallbackEnabled;
  const readyForOpenAiBackedTesting = hasOpenAiKey;
  const status = readyForOpenAiBackedTesting
    ? "ready"
    : readyForLocalFallbackTesting
      ? "fallback_only"
      : "configuration_needed";

  return {
    service: "cookooi",
    version: 1,
    checkedAt: nowIso(options),
    status,
    ready: {
      localFallbackTesting: readyForLocalFallbackTesting,
      openAiBackedTesting: readyForOpenAiBackedTesting,
    },
    routes: {
      local: localRoute,
      public: publicRoute,
    },
    checks,
  };
}

export async function handleOperationsHealthRequest(request, env = {}, options = {}) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ error: "method_not_allowed", message: "Use GET to check Cookooi health." }, 405, {
      allow: "GET, HEAD",
    });
  }

  const body = createOperationsHealth(env, options);
  return jsonResponse(body, 200);
}

function nowIso(options) {
  const now = options.now ? options.now() : new Date();
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
