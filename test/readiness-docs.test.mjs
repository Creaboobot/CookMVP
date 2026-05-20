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
  assert.match(readme, /Save one recipe, refresh the page/);
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
