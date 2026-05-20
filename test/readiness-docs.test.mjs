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

  assert.match(readme, /OPENAI_API_KEY/);
  assert.match(readme, /AI-generated/);
  assert.match(readme, /COOKOOI_ENABLE_FALLBACK=true/);
  assert.match(readme, /fallback output/);
});

test("tester-facing browser code avoids mojibake separators", async () => {
  const script = await readFile(new URL("../public/recipe.js", import.meta.url), "utf8");

  assert.doesNotMatch(script, /\u00c2/);
  assert.match(script, /\.join\(" - "\)/);
});
