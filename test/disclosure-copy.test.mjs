import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("shows concise privacy, AI, and safety disclosure before generation", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(html, /AI-generated recipe proposals/);
  assert.match(html, /processes the ingredients you have, any craving you add, and saved baseline settings/);
  assert.match(html, /Do not enter sensitive personal information/);
  assert.match(html, /allergies, freshness, and cooking safety/);
  assert.match(html, /Saved recipes and test-session data stay in this browser/);
  assert.match(html, /does not store raw ingredients, cravings, or free-text/);
  assert.match(html, /Session data export/);
});

test("moves preference controls into saved settings", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/recipe.js", import.meta.url), "utf8");

  assert.match(html, /id="settings-toggle-button"/);
  assert.match(html, /id="settings-fields" hidden/);
  assert.match(html, /id="meal-type-input"/);
  assert.match(html, /Save settings/);
  assert.match(script, /readRecipeSettings/);
  assert.match(script, /saveRecipeSettings/);
});

test("includes a bounded three-more recipe action after results", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/recipe.js", import.meta.url), "utf8");

  assert.match(html, /id="try-more-button"/);
  assert.match(html, />Try three more</);
  assert.match(script, /previousRecipeTitles/);
  assert.match(script, /Finding three more Cookooi meal ideas/);
  assert.match(script, /maxPreviousRecipeTitles = 12/);
});
