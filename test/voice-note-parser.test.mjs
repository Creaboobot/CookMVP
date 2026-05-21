import test from "node:test";
import assert from "node:assert/strict";
import { buildRecipeRequestPayload } from "../public/recipe-payload.js";
import { parseVoiceNoteTranscript } from "../public/voice-note-parser.js";

test("parses one voice note into available items, craving, and constraints", () => {
  const parsed = parseVoiceNoteTranscript(
    "I have potatoes, bacon, kale and cheddar. Make spicy dinner for three in 30 minutes, no peanuts, dairy-free, use stovetop and blender.",
  );

  assert.deepEqual(parsed, {
    ingredientsText: "potatoes, bacon, kale, cheddar",
    craving: "spicy dinner",
    constraints: {
      avoid: "peanuts",
      diet: "dairy-free",
      mealType: "dinner",
      servings: 3,
      maxTotalTimeMinutes: 30,
      cuisineOrFlavor: "Spicy",
      equipment: ["stovetop", "blender"],
    },
  });
});

test("keeps craving optional when voice note only includes items and context", () => {
  const parsed = parseVoiceNoteTranscript("We have rice and eggs for breakfast for two.");

  assert.equal(parsed.ingredientsText, "rice, eggs");
  assert.equal(parsed.craving, "");
  assert.deepEqual(parsed.constraints, {
    mealType: "breakfast",
    servings: 2,
  });
});

test("stops avoidances before equipment-only cues", () => {
  const parsed = parseVoiceNoteTranscript(
    "I have potatoes, bacon, kale, and cheddar. Make dinner for three in 30 minutes, no peanuts, stovetop only.",
  );

  assert.deepEqual(parsed, {
    ingredientsText: "potatoes, bacon, kale, cheddar",
    craving: "dinner",
    constraints: {
      avoid: "peanuts",
      mealType: "dinner",
      servings: 3,
      maxTotalTimeMinutes: 30,
      equipment: ["stovetop"],
    },
  });
});

test("keeps imperative equipment cues out of parsed avoidances", () => {
  assert.equal(parseVoiceNoteTranscript("I have rice and tofu, no peanuts, use stovetop.").constraints.avoid, "peanuts");

  const parsed = parseVoiceNoteTranscript("I have rice and tofu, no shellfish, use microwave only.");

  assert.equal(parsed.constraints.avoid, "shellfish");
  assert.deepEqual(parsed.constraints.equipment, ["microwave"]);
});

test("keeps sentence-separated equipment cues out of parsed avoidances", () => {
  const parsed = parseVoiceNoteTranscript(
    "I have potatoes, bacon, kale, and cheddar. Make dinner for three in 30 minutes. No peanuts. Stovetop only.",
  );

  assert.equal(parsed.constraints.avoid, "peanuts");
  assert.deepEqual(parsed.constraints.equipment, ["stovetop"]);
});

test("does not send equipment transcript tail text as a request avoidance", () => {
  const parsed = parseVoiceNoteTranscript("I have rice and tofu, no shellfish, use microwave only.");
  const payload = buildRecipeRequestPayload({
    ingredientsText: parsed.ingredientsText,
    craving: parsed.craving,
    avoid: parsed.constraints.avoid,
    equipment: parsed.constraints.equipment,
  });

  assert.equal(payload.constraints.avoid, "shellfish");
  assert.doesNotMatch(payload.constraints.avoid, /use|microwave|only/i);
  assert.deepEqual(payload.constraints.equipment, ["microwave"]);
});

test("returns empty structured fields for blank transcript fallback", () => {
  assert.deepEqual(parseVoiceNoteTranscript("   "), {
    ingredientsText: "",
    craving: "",
    constraints: {},
  });
});
