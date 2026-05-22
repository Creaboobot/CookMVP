#!/usr/bin/env node
const DEFAULT_TARGET = "http://127.0.0.1:3004";

const args = process.argv.slice(2);
const requireOpenAi = args.includes("--require-openai");
const targetArg = args.find((arg) => !arg.startsWith("--"));
const target = normalizeTarget(targetArg || process.env.COOKOOI_HEALTH_TARGET || DEFAULT_TARGET);

try {
  const health = await fetchJson(new URL("/api/health", target));
  await fetchHome(new URL("/", target));

  console.log(`COOKOOI_HEALTH_TARGET=${target.href.replace(/\/$/, "")}`);
  console.log(`COOKOOI_HEALTH_STATUS=${health.status}`);
  console.log(`COOKOOI_LOCAL_FALLBACK_READY=${Boolean(health.ready?.localFallbackTesting)}`);
  console.log(`COOKOOI_OPENAI_BACKED_READY=${Boolean(health.ready?.openAiBackedTesting)}`);
  console.log(`COOKOOI_RECIPE_GENERATION=${health.checks?.recipe_generation?.status || "unknown"}`);
  console.log(`COOKOOI_VOICE_TRANSCRIPTION=${health.checks?.voice_transcription?.status || "unknown"}`);

  if (!health.ready?.localFallbackTesting) {
    throw new Error("Cookooi is not ready for local fallback testing. Configure OPENAI_API_KEY or COOKOOI_ENABLE_FALLBACK=true.");
  }

  if (requireOpenAi && !health.ready?.openAiBackedTesting) {
    throw new Error("Cookooi is not ready for OpenAI-backed public testing. Configure OPENAI_API_KEY server-side.");
  }
} catch (error) {
  console.error(`COOKOOI_HEALTH_ERROR=${error.message}`);
  process.exitCode = 1;
}

function normalizeTarget(value) {
  const url = new URL(value);
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`GET ${url.href} returned ${response.status}`);
  }
  return response.json();
}

async function fetchHome(url) {
  const response = await fetch(url, { headers: { accept: "text/html" } });
  if (!response.ok) {
    throw new Error(`GET ${url.href} returned ${response.status}`);
  }
}
