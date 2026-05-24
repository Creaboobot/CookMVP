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
  assert.match(html, /does not store raw ingredients, cravings, follow-up questions/);
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

test("includes a reviewable voice note transcript fallback without storing raw transcript analytics", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/recipe.js", import.meta.url), "utf8");
  const feedbackStore = await readFile(new URL("../public/feedback-store.js", import.meta.url), "utf8");

  assert.match(html, /id="voice-note-input"/);
  assert.match(html, /id="voice-review-panel" hidden/);
  assert.match(html, /Parsed available items/);
  assert.match(html, /Record voice note/);
  assert.match(html, /Audio is sent only for transcription/);
  assert.match(html, /raw\s+transcript is used only on this page/);
  assert.match(script, /parseVoiceNoteTranscript/);
  assert.match(script, /voiceConstraintOverrides/);
  assert.doesNotMatch(feedbackStore, /transcript/i);
});

test("uses in-app audio recording with clear text fallback states", async () => {
  const script = await readFile(new URL("../public/recipe.js", import.meta.url), "utf8");

  assert.match(script, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(script, /new MediaRecorder/);
  assert.match(script, /selectVoiceRecordingMimeType/);
  assert.match(script, /transcribeVoiceBlob/);
  assert.match(script, /Record voice note/);
  assert.match(script, /Stop recording/);
  assert.match(script, /Microphone permission was blocked/);
  assert.match(script, /Paste a transcript below/);
  assert.doesNotMatch(script, /Ready to record\. Tap Record, then Stop\./);
  assert.doesNotMatch(script, /keyboard microphone/i);
});

test("includes per-meal follow-up UI without raw question analytics", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/recipe.js", import.meta.url), "utf8");
  const feedbackStore = await readFile(new URL("../public/feedback-store.js", import.meta.url), "utf8");
  const templateStart = html.indexOf('<template id="proposal-template">');
  const templateEnd = html.indexOf("</template>", templateStart);
  const template = html.slice(templateStart, templateEnd);
  const refinementIndex = template.indexOf('class="recipe-refinement"');
  const saveIndex = template.indexOf('class="save-button"', refinementIndex);

  assert.match(html, /class="refinement-form"/);
  assert.match(html, /class="refinement-question"/);
  assert.match(html, /class="refinement-result" hidden/);
  assert.ok(refinementIndex > -1);
  assert.ok(saveIndex > refinementIndex);
  assert.match(script, /\/api\/recipes\/refine/);
  assert.match(script, /recordRefinementSuccess/);
  assert.match(feedbackStore, /questionLength/);
  assert.doesNotMatch(feedbackStore, /questionText/);
});
