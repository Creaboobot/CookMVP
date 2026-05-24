import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("shows concise privacy, AI, and safety disclosure on the first screen", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(html, /Before you cook/);
  assert.match(html, /Recipes are AI-generated unless labeled fallback/);
  assert.match(html, /Do not enter sensitive personal\s+information/);
  assert.match(html, /allergies, freshness, and cooking safety/);
  assert.match(html, /Saved recipes and session data stay in this browser/);
  assert.match(html, /Audio is sent only for\s+transcription/);
  assert.match(html, /session analytics avoid raw request text/);
  assert.doesNotMatch(html, /AI-generated recipe proposals/);
  assert.doesNotMatch(html, /processes the request you type or say and saved baseline settings/);
  assert.match(html, /Session data export/);
});

test("moves preference controls into a settings modal", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/recipe.js", import.meta.url), "utf8");
  const generateIndex = html.indexOf('id="generate-button"');
  const settingsLineIndex = html.indexOf('id="settings-line-title"');
  const settingsDialogIndex = html.indexOf('id="settings-dialog"');

  assert.ok(generateIndex > -1);
  assert.ok(settingsLineIndex > generateIndex);
  assert.ok(settingsDialogIndex > settingsLineIndex);
  assert.match(html, /id="settings-toggle-button"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /id="settings-dialog"/);
  assert.match(html, /id="settings-fields"/);
  assert.match(html, /id="meal-type-input"/);
  assert.match(html, /Close/);
  assert.match(html, /Save settings/);
  assert.match(script, /showModal/);
  assert.match(script, /settingsDialog\.close/);
  assert.match(script, /readRecipeSettings/);
  assert.match(script, /saveRecipeSettings/);
  assert.match(script, /resetRecipeSettings/);
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

test("uses one combined input for typed and spoken requests without storing raw transcript analytics", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/recipe.js", import.meta.url), "utf8");
  const feedbackStore = await readFile(new URL("../public/feedback-store.js", import.meta.url), "utf8");
  const talkIndex = html.indexOf('id="dictate-button"');
  const generateIndex = html.indexOf('id="generate-button"');

  assert.match(html, /Ingredients and craving/);
  assert.match(html, /Add ingredients; craving is optional/);
  assert.match(script, /Add ingredients; craving is optional/);
  assert.ok(talkIndex > -1);
  assert.ok(generateIndex > talkIndex);
  assert.doesNotMatch(html, /Add ingredients and a craving to generate three starter recipes/);
  assert.doesNotMatch(script, /Add ingredients and a craving to generate three starter recipes/);
  assert.doesNotMatch(html, /Voice note/);
  assert.doesNotMatch(html, /Talk into the same request/);
  assert.doesNotMatch(html, /id="craving-input"/);
  assert.doesNotMatch(html, /id="voice-note-input"/);
  assert.doesNotMatch(html, /id="voice-review-panel"/);
  assert.match(html, /Talk and get ideas/);
  assert.match(html, /Audio is sent only for\s+transcription/);
  assert.match(script, /buildRecipeRequestPayloadFromNaturalText/);
  assert.doesNotMatch(script, /voiceConstraintOverrides/);
  assert.doesNotMatch(feedbackStore, /transcript/i);
});

test("uses in-app audio recording with clear text fallback states", async () => {
  const script = await readFile(new URL("../public/recipe.js", import.meta.url), "utf8");

  assert.match(script, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(script, /new MediaRecorder/);
  assert.match(script, /selectVoiceRecordingMimeType/);
  assert.match(script, /transcribeVoiceBlob/);
  assert.match(script, /Talk and get ideas/);
  assert.match(script, /Stop recording/);
  assert.match(script, /Microphone permission was blocked/);
  assert.match(script, /type the request above/);
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
