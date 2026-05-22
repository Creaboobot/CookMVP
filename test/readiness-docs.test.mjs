import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("documents the first user testing readiness flow", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  assert.match(readme, /User testing readiness checklist/);
  assert.match(readme, /npm ci/);
  assert.match(readme, /npm start/);
  assert.match(readme, /http:\/\/127\.0\.0\.1:3004/);
  assert.match(readme, /https:\/\/cookooi\.creabooboard\.win/);
  assert.match(readme, /exactly three proposals/);
  assert.match(readme, /Open Settings/);
  assert.match(readme, /Reset Settings/);
  assert.match(readme, /Save one recipe, refresh the page/);
  assert.match(readme, /ask a follow-up/);
  assert.match(readme, /follow-up records/);
  assert.match(readme, /Export session JSON/);
  assert.match(readme, /Tester instruction script/);
  assert.match(readme, /Known limitations for first testing/);
});

test("documents provider configuration and fallback expectations", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const providerDoc = await readFile(new URL("../docs/openai-provider-verification.md", import.meta.url), "utf8");

  assert.match(readme, /OPENAI_API_KEY/);
  assert.match(readme, /AI-generated/);
  assert.match(readme, /COOKOOI_ENABLE_FALLBACK=true/);
  assert.match(readme, /fallback output/);
  assert.match(readme, /openai-provider-verification\.md/);
  assert.match(providerDoc, /OpenAI Provider Verification/);
  assert.match(providerDoc, /server environment only/);
  assert.match(providerDoc, /provider_unavailable/);
  assert.match(providerDoc, /source: "ai"/);
  assert.match(providerDoc, /provider: "openai"/);
  assert.match(providerDoc, /\.dev\.vars` is ignored by Git/);
  assert.doesNotMatch(providerDoc, /sk-[A-Za-z0-9_-]{20,}/);
});

test("documents server-side voice transcription boundaries", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const contract = await readFile(new URL("../docs/ai-recipe-contract.md", import.meta.url), "utf8");

  assert.match(readme, /POST \/api\/voice\/transcribe/);
  assert.match(readme, /OPENAI_TRANSCRIPTION_MODEL/);
  assert.match(readme, /gpt-4o-mini-transcribe/);
  assert.match(readme, /does not persist raw audio/);
  assert.match(readme, /MediaRecorder/);
  assert.match(readme, /transcript field remains available/);
  assert.match(readme, /mobile-voice-validation\.md/);
  assert.match(contract, /Voice Transcription API/);
  assert.match(contract, /multipart\/form-data/);
  assert.match(contract, /getUserMedia/);
  assert.match(contract, /MediaRecorder/);
  assert.match(contract, /audio\/mp4/);
  assert.match(contract, /audio\/webm/);
  assert.match(contract, /4 MB/);
  assert.match(contract, /server-side only/);
  assert.doesNotMatch(contract, /sk-[A-Za-z0-9_-]{20,}/);
});

test("documents public HTTPS mobile voice validation outcome", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const validationDoc = await readFile(new URL("../docs/mobile-voice-validation.md", import.meta.url), "utf8");

  assert.match(readme, /Mobile voice validation result/);
  assert.match(readme, /https:\/\/cookooi\.creabooboard\.win/);
  assert.match(readme, /gpt-4o-mini-transcribe/);
  assert.match(readme, /physical iPhone Safari microphone permission/);
  assert.match(validationDoc, /Task 27 validated the public HTTPS voice path/);
  assert.match(validationDoc, /21b5349de941a7b8519c0a22b332c0da52b804c2/);
  assert.match(validationDoc, /POST \/api\/voice\/transcribe/);
  assert.match(validationDoc, /390px mobile Safari-profile/);
  assert.match(validationDoc, /Unsupported Media Type/);
  assert.doesNotMatch(validationDoc, /sk-[A-Za-z0-9_-]{20,}/);
});

test("tester-facing browser code avoids mojibake separators", async () => {
  const script = await readFile(new URL("../public/recipe.js", import.meta.url), "utf8");

  assert.doesNotMatch(script, /\u00c2/);
  assert.match(script, /\.join\(" - "\)/);
});

test("documents the canonical local workspace and retired paths", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const workspaceDoc = await readFile(new URL("../docs/local-workspace.md", import.meta.url), "utf8");
  const cleanupDoc = await readFile(new URL("../docs/automation-cleanup.md", import.meta.url), "utf8");

  assert.match(readme, /Local workspace/);
  assert.match(readme, /Documents\\Cookooi/);
  assert.match(readme, /CookooiAutomation\\runs/);
  assert.match(readme, /automation-cleanup\.md/);
  assert.match(workspaceDoc, /Canonical Human Workspace/);
  assert.match(workspaceDoc, /Documents\\Cookooi/);
  assert.match(workspaceDoc, /Documents\\CookMVP/);
  assert.match(workspaceDoc, /infra-ci-worktree/);
  assert.match(workspaceDoc, /Do not delete or reset local files/);
  assert.match(cleanupDoc, /Remote Branch Policy/);
  assert.match(cleanupDoc, /Local Worktree Policy/);
  assert.match(cleanupDoc, /PRs #1-#14|#14/);
  assert.match(cleanupDoc, /MIRROR_OK=true/);
});

test("documents agent operations for future task batches", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const operationsDoc = await readFile(new URL("../docs/agent-operations.md", import.meta.url), "utf8");

  assert.match(readme, /Agent operations/);
  assert.match(readme, /agent-operations\.md/);
  assert.match(operationsDoc, /Selected Operating Mode/);
  assert.match(operationsDoc, /creaboo\\Creaboo_human/);
  assert.match(operationsDoc, /health-check\.ps1/);
  assert.match(operationsDoc, /-AllowPushProbe -RequirePush/);
  assert.match(operationsDoc, /CAN_PUBLISH=True/);
  assert.match(operationsDoc, /repair-mirror-cache\.ps1/);
  assert.match(operationsDoc, /Connector Fallback Rules/);
  assert.match(operationsDoc, /CodexSandboxOffline/);
  assert.match(operationsDoc, /No-op Review Behavior/);
});

test("documents account and community architecture boundaries", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const architectureDoc = await readFile(new URL("../docs/account-community-architecture.md", import.meta.url), "utf8");
  const requiredEntities = [
    "users",
    "user_profiles",
    "recipe_requests",
    "generated_recipes",
    "saved_recipes",
    "public_recipes",
    "public_recipe_versions",
    "recipe_publications",
    "recipe_likes",
    "recipe_bookmarks",
    "recipe_reports",
    "ranking_signals",
    "feedback_events",
    "follow_up_requests",
    "audit_events",
  ];

  assert.match(readme, /account-community-architecture\.md/);
  assert.match(readme, /auth-database-environment-strategy\.md/);
  assert.match(architectureDoc, /Generated private/);
  assert.match(architectureDoc, /Saved private/);
  assert.match(architectureDoc, /Published public/);
  assert.match(architectureDoc, /Public version/);
  assert.match(architectureDoc, /Reported\/hidden/);
  assert.match(architectureDoc, /voice transcripts/);
  assert.match(architectureDoc, /raw prompts/);
  assert.match(architectureDoc, /people-also-liked recommendations/);
  assert.match(architectureDoc, /Anonymous-To-Account Migration/);
  assert.match(architectureDoc, /Open Decisions Needing Human Confirmation/);
  for (const entity of requiredEntities) {
    assert.match(architectureDoc, new RegExp(`\\\`${entity}\\\``));
  }
  assert.doesNotMatch(architectureDoc, /\bfridge\b/i);
});

test("documents auth database and environment strategy", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const architectureDoc = await readFile(new URL("../docs/account-community-architecture.md", import.meta.url), "utf8");
  const strategyDoc = await readFile(
    new URL("../docs/auth-database-environment-strategy.md", import.meta.url),
    "utf8",
  );

  assert.match(readme, /Supabase Auth plus Postgres/);
  assert.match(architectureDoc, /auth-database-environment-strategy\.md/);
  assert.match(strategyDoc, /Primary recommendation: Supabase Auth plus Supabase Postgres/);
  assert.match(strategyDoc, /Fallback path: Clerk plus managed Postgres/);
  assert.match(strategyDoc, /Cloudflare D1/);
  assert.match(strategyDoc, /Row Level Security/);
  assert.match(strategyDoc, /local, preview, and production/);
  assert.match(strategyDoc, /OPENAI_API_KEY/);
  assert.match(strategyDoc, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(strategyDoc, /SUPABASE_DB_URL/);
  assert.match(strategyDoc, /COOKOOI_ACCOUNTS_ENABLED=false/);
  assert.match(strategyDoc, /preview branches/);
  assert.match(strategyDoc, /PITR/);
  assert.match(strategyDoc, /No committed secrets/);
  assert.match(strategyDoc, /does not add account UI, live database writes/);
  assert.doesNotMatch(strategyDoc, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(strategyDoc, /\bfridge\b/i);
});

test("documents disabled data access layer and feature flag boundaries", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const dataAccessDoc = await readFile(new URL("../docs/data-access-layer.md", import.meta.url), "utf8");

  assert.match(readme, /data-access-layer\.md/);
  assert.match(dataAccessDoc, /COOKOOI_ACCOUNTS_ENABLED=false/);
  assert.match(dataAccessDoc, /COOKOOI_SERVER_LIBRARY_ENABLED=false/);
  assert.match(dataAccessDoc, /COOKOOI_PUBLIC_RECIPES_ENABLED=false/);
  assert.match(dataAccessDoc, /COOKOOI_COMMUNITY_SIGNALS_ENABLED=false/);
  assert.match(dataAccessDoc, /src\/request-context\.mjs/);
  assert.match(dataAccessDoc, /src\/data-services\.mjs/);
  assert.match(dataAccessDoc, /public\/local-data-services\.js/);
  assert.match(dataAccessDoc, /user profiles, recipe requests, saved recipes/);
  assert.match(dataAccessDoc, /community interactions/);
  assert.match(dataAccessDoc, /browser-local until a later account task/);
  assert.doesNotMatch(dataAccessDoc, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(dataAccessDoc, /\bfridge\b/i);
});

test("documents auth session and authorization boundaries", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const dataAccessDoc = await readFile(new URL("../docs/data-access-layer.md", import.meta.url), "utf8");
  const authDoc = await readFile(new URL("../docs/auth-session-authorization.md", import.meta.url), "utf8");

  assert.match(readme, /auth-session-authorization\.md/);
  assert.match(dataAccessDoc, /Auth Session Boundary/);
  assert.match(authDoc, /server-verified identity/);
  assert.match(authDoc, /anonymous/);
  assert.match(authDoc, /authenticated/);
  assert.match(authDoc, /x-cookooi-user-id/);
  assert.match(authDoc, /authorizePrivateResourceAccess/);
  assert.match(authDoc, /authorizePublicRecipeRead/);
  assert.match(authDoc, /authorizeModerationAction/);
  assert.match(authDoc, /moderator/);
  assert.match(authDoc, /admin/);
  assert.match(authDoc, /support/);
  assert.match(authDoc, /Raw prompts|raw prompts/);
  assert.match(authDoc, /voice transcripts/);
  assert.match(authDoc, /COOKOOI_ACCOUNTS_ENABLED=false/);
  assert.doesNotMatch(authDoc, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(authDoc, /\bfridge\b/i);
});

test("documents privacy consent retention and sanitization boundaries", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const architectureDoc = await readFile(new URL("../docs/account-community-architecture.md", import.meta.url), "utf8");
  const dataAccessDoc = await readFile(new URL("../docs/data-access-layer.md", import.meta.url), "utf8");
  const schemaDoc = await readFile(new URL("../docs/database-schema-baseline.md", import.meta.url), "utf8");
  const privacyDoc = await readFile(new URL("../docs/privacy-consent-retention.md", import.meta.url), "utf8");

  assert.match(readme, /privacy-consent-retention\.md/);
  assert.match(readme, /privacy-governance\.mjs/);
  assert.match(architectureDoc, /privacy-consent-retention\.md/);
  assert.match(dataAccessDoc, /privacy-governance\.mjs/);
  assert.match(schemaDoc, /privacy-consent-retention\.md/);
  assert.match(privacyDoc, /Raw voice audio/);
  assert.match(privacyDoc, /Not retained by default/);
  assert.match(privacyDoc, /Publication is never automatic/);
  assert.match(privacyDoc, /explicit publication consent/i);
  assert.match(privacyDoc, /voice transcripts/);
  assert.match(privacyDoc, /raw prompts/);
  assert.match(privacyDoc, /private notes/);
  assert.match(privacyDoc, /follow-up questions/);
  assert.match(privacyDoc, /Analytics And Feedback Rules/);
  assert.match(privacyDoc, /Export And Deletion Expectations/);
  assert.match(privacyDoc, /Report And Moderation Workflow/);
  assert.doesNotMatch(privacyDoc, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(privacyDoc, /postgres(?:ql)?:\/\/[^`\s]+:[^`\s]+@/i);
  assert.doesNotMatch(privacyDoc, /\bfridge\b/i);
});
