import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("shows concise privacy, AI, and safety disclosure before generation", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(html, /AI-generated recipe proposals/);
  assert.match(html, /processes the ingredients you have, your craving, and optional preferences/);
  assert.match(html, /Do not enter sensitive personal information/);
  assert.match(html, /allergies, freshness, and cooking safety/);
  assert.match(html, /Saved recipes stay in this browser/);
  assert.match(html, /does not store raw ingredients, cravings, or free-text/);
});
