import test from "node:test";
import assert from "node:assert/strict";
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

test("returns empty structured fields for blank transcript fallback", () => {
  assert.deepEqual(parseVoiceNoteTranscript("   "), {
    ingredientsText: "",
    craving: "",
    constraints: {},
  });
});
