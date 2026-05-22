import test from "node:test";
import assert from "node:assert/strict";
import { createOperationsHealth, handleOperationsHealthRequest } from "../src/operations-health.mjs";

test("reports configuration needed when provider and fallback are absent", () => {
  const health = createOperationsHealth({}, { now: () => new Date("2026-05-22T01:00:00.000Z") });

  assert.equal(health.service, "cookooi");
  assert.equal(health.status, "configuration_needed");
  assert.equal(health.ready.localFallbackTesting, false);
  assert.equal(health.ready.openAiBackedTesting, false);
  assert.equal(health.checks.recipe_generation.status, "configuration_needed");
  assert.equal(health.checks.voice_transcription.status, "configuration_needed");
  assert.equal(health.checks.feedback_capture.mode, "browser_local");
  assert.equal(health.checks.rate_limits.maxRequests, 20);
  assert.equal(health.checks.rate_limits.windowMs, 600000);
});

test("distinguishes local fallback readiness from OpenAI-backed testing", () => {
  const health = createOperationsHealth({ COOKOOI_ENABLE_FALLBACK: "true" });

  assert.equal(health.status, "fallback_only");
  assert.equal(health.ready.localFallbackTesting, true);
  assert.equal(health.ready.openAiBackedTesting, false);
  assert.equal(health.checks.recipe_generation.status, "fallback_only");
  assert.equal(health.checks.recipe_generation.fallbackEnabled, true);
});

test("reports OpenAI-backed testing readiness without exposing secret values", () => {
  const health = createOperationsHealth({
    OPENAI_API_KEY: "sk-test-secret-value",
    OPENAI_MODEL: "test-recipe-model",
    OPENAI_TRANSCRIPTION_MODEL: "test-transcription-model",
    COOKOOI_RATE_LIMIT_MAX_REQUESTS: "7",
    COOKOOI_RATE_LIMIT_WINDOW_MS: "120000",
    COOKOOI_PUBLIC_ROUTE: "https://cookooi.example.test",
  });
  const serialized = JSON.stringify(health);

  assert.equal(health.status, "ready");
  assert.equal(health.ready.openAiBackedTesting, true);
  assert.equal(health.checks.recipe_generation.model, "test-recipe-model");
  assert.equal(health.checks.voice_transcription.model, "test-transcription-model");
  assert.equal(health.checks.rate_limits.maxRequests, 7);
  assert.equal(health.checks.rate_limits.windowMs, 120000);
  assert.equal(health.routes.public, "https://cookooi.example.test");
  assert.doesNotMatch(serialized, /sk-test-secret-value/);
});

test("serves health JSON for GET requests", async () => {
  const response = await handleOperationsHealthRequest(
    new Request("http://cookooi.test/api/health"),
    { COOKOOI_ENABLE_FALLBACK: "true" },
    { now: () => new Date("2026-05-22T01:30:00.000Z") },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.checkedAt, "2026-05-22T01:30:00.000Z");
  assert.equal(body.status, "fallback_only");
});

test("rejects unsupported health methods", async () => {
  const response = await handleOperationsHealthRequest(
    new Request("http://cookooi.test/api/health", { method: "POST" }),
  );
  const body = await response.json();

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
  assert.equal(body.error, "method_not_allowed");
});
