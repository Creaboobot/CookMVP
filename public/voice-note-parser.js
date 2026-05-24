const supportedDiets = new Map([
  ["vegetarian", "vegetarian"],
  ["vegan", "vegan"],
  ["gluten free", "gluten-free"],
  ["gluten-free", "gluten-free"],
  ["dairy free", "dairy-free"],
  ["dairy-free", "dairy-free"],
  ["halal", "halal"],
  ["kosher", "kosher"],
]);
const supportedMealTypes = new Set(["breakfast", "lunch", "dinner", "snack"]);
const supportedEquipment = new Map([
  ["oven", "oven"],
  ["stovetop", "stovetop"],
  ["stove top", "stovetop"],
  ["stove", "stovetop"],
  ["microwave", "microwave"],
  ["blender", "blender"],
  ["air fryer", "air-fryer"],
  ["air-fryer", "air-fryer"],
]);
const numberWords = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
]);
const cuisineOrFlavorSignals = [
  "bright",
  "cozy",
  "crispy",
  "fresh",
  "indian",
  "italian",
  "japanese",
  "korean",
  "mediterranean",
  "mexican",
  "smoky",
  "spicy",
  "thai",
];

export function parseVoiceNoteTranscript(transcript) {
  const text = cleanText(transcript);
  const constraints = {};

  if (!text) {
    return {
      ingredientsText: "",
      craving: "",
      constraints,
    };
  }

  const avoid = extractAvoidances(text);
  const diet = extractDiet(text);
  const mealType = extractMealType(text);
  const servings = extractServings(text);
  const maxTotalTimeMinutes = extractMaxTotalTimeMinutes(text);
  const cuisineOrFlavor = extractCuisineOrFlavor(text);
  const equipment = extractEquipment(text);

  if (avoid) {
    constraints.avoid = avoid;
  }
  if (diet) {
    constraints.diet = diet;
  }
  if (mealType) {
    constraints.mealType = mealType;
  }
  if (servings) {
    constraints.servings = servings;
  }
  if (maxTotalTimeMinutes) {
    constraints.maxTotalTimeMinutes = maxTotalTimeMinutes;
  }
  if (cuisineOrFlavor) {
    constraints.cuisineOrFlavor = cuisineOrFlavor;
  }
  if (equipment.length) {
    constraints.equipment = equipment;
  }

  return {
    ingredientsText: extractIngredients(text),
    craving: extractCraving(text),
    constraints,
  };
}

function extractIngredients(text) {
  const match = text.match(
    /(?:^|\b)(?:i|we)\s+(?:have|have got|got)\s+(.+)|(?:^|\b)(?:ingredients|items)(?:\s+(?:i|we)\s+have|\s+available)?\s+(?:are|include)\s+(.+)|(?:^|\b)use\s+(.+)/i,
  );
  const segment = cleanText(match?.[1] || match?.[2] || match?.[3] || "");

  if (segment) {
    return normalizeListPhrase(firstSentence(stopAtCue(segment, ingredientStopCues())));
  }

  return normalizeListPhrase(firstSentence(stopAtCue(fallbackIngredientSegment(text), ingredientStopCues())));
}

function extractCraving(text) {
  const match = text.match(
    /(?:^|\b)(?:i|we)?\s*(?:want|would like|am craving|are craving|craving|feel like|make|cook)\s+(?:me|us)?\s*(.+)/i,
  );
  const segment = cleanText(match?.[1] || "");

  if (segment) {
    return stopAtCue(segment, cravingStopCues());
  }

  return stopAtCue(fallbackCravingSegment(text), cravingStopCues());
}

function extractAvoidances(text) {
  const match = text.match(/(?:^|\b)(?:avoid|without|no|allergic to|can't have|cannot have)\s+(.+)/i);
  const segment = cleanText(match?.[1] || "");

  return normalizeListPhrase(stopAtCue(segment, avoidStopCues()));
}

function extractDiet(text) {
  const lower = text.toLowerCase();

  for (const [signal, value] of supportedDiets) {
    if (new RegExp(`\\b${escapeRegex(signal)}\\b`, "i").test(lower)) {
      return value;
    }
  }

  return "";
}

function extractMealType(text) {
  const lower = text.toLowerCase();

  for (const mealType of supportedMealTypes) {
    if (new RegExp(`\\b${mealType}\\b`, "i").test(lower)) {
      return mealType;
    }
  }

  return "";
}

function extractServings(text) {
  const lower = text.toLowerCase();
  const numericMatch = lower.match(/\b(?:for|serves?|serving(?:s)?(?: for)?)\s+(\d{1,2})\s*(?:people|persons|servings?)?\b/);
  if (numericMatch) {
    return boundedInteger(numericMatch[1], 1, 12);
  }

  const wordMatch = lower.match(/\b(?:for|serves?|serving(?:s)?(?: for)?)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:people|persons|servings?)?\b/);
  if (wordMatch) {
    return numberWords.get(wordMatch[1]) || null;
  }

  return null;
}

function extractMaxTotalTimeMinutes(text) {
  const lower = text.toLowerCase();
  const match = lower.match(/\b(?:under|within|in|less than|max(?:imum)?(?: of)?)\s+(\d{1,3})\s*(?:minutes?|mins?)\b/);

  return match ? boundedInteger(match[1], 5, 240) : null;
}

function extractCuisineOrFlavor(text) {
  const lower = text.toLowerCase();
  const found = cuisineOrFlavorSignals.filter((signal) => new RegExp(`\\b${escapeRegex(signal)}\\b`, "i").test(lower));

  return found
    .map((signal) => signal.charAt(0).toUpperCase() + signal.slice(1))
    .join(", ")
    .slice(0, 120);
}

function extractEquipment(text) {
  const lower = text.toLowerCase();
  const found = [];

  for (const [signal, value] of supportedEquipment) {
    if (new RegExp(`\\b${escapeRegex(signal)}\\b`, "i").test(lower)) {
      found.push(value);
    }
  }

  return [...new Set(found)];
}

function fallbackIngredientSegment(text) {
  const [first = ""] = sentenceSegments(text);

  if (!first || looksLikeConstraintOnly(first) || looksLikeCravingOnly(first)) {
    return "";
  }

  return first;
}

function fallbackCravingSegment(text) {
  return (
    sentenceSegments(text)
      .slice(1)
      .find((segment) => !looksLikeConstraintOnly(segment) && !looksLikeIngredientList(segment)) || ""
  );
}

function sentenceSegments(text) {
  return cleanText(text)
    .split(/[.!?]+/)
    .map(cleanText)
    .filter(Boolean);
}

function firstSentence(text) {
  return sentenceSegments(text)[0] || cleanText(text);
}

function looksLikeConstraintOnly(segment) {
  return Boolean(
    segment.match(
      /^(?:no|avoid|without|allergic to|can't have|cannot have|under|within|less than|max(?:imum)?|for|serves?|serving|stovetop|stove|oven|microwave|blender|air[- ]fryer|vegetarian|vegan|gluten[- ]free|dairy[- ]free|halal|kosher)\b/i,
    ),
  );
}

function looksLikeCravingOnly(segment) {
  return Boolean(
    segment.match(/^(?:something|make|cook|want|would like|craving|feel like|quick|cozy|spicy|savory|sweet)\b/i),
  );
}

function looksLikeIngredientList(segment) {
  return segment.includes(",");
}

function ingredientStopCues() {
  return [
    /\b(?:and\s+)?(?:i|we)\s+(?:want|would like|am craving|are craving|need)\b/i,
    /\band\s+(?:want|would like|am craving|are craving|need|feel like)\b/i,
    /\b(?:make|cook)\s+(?:me|us)?\b/i,
    /\b(?:avoid|without|allergic to|can't have|cannot have)\b/i,
    /\bno\s+\w+/i,
    /\b(?:(?:use|using|with)\s+(?:the\s+)?(?:oven|stove|stovetop|microwave|blender|air[- ]fryer)(?:\s+only)?|(?:the\s+)?(?:oven|stove|stovetop|microwave|blender|air[- ]fryer)\s+only)\b/i,
    /\b(?:for|serves?|serving(?:s)?(?: for)?)\s+(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i,
    /\b(?:under|within|in|less than|max(?:imum)?(?: of)?)\s+\d{1,3}\s*(?:minutes?|mins?)\b/i,
    /\b(?:vegetarian|vegan|gluten[- ]free|dairy[- ]free|halal|kosher)\b/i,
    /\b(?:for\s+)?(?:breakfast|lunch|dinner|snack)\b/i,
  ];
}

function cravingStopCues() {
  return [
    /\b(?:avoid|without|allergic to|can't have|cannot have)\b/i,
    /\bno\s+\w+/i,
    /\b(?:for|serves?|serving(?:s)?(?: for)?)\s+(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i,
    /\b(?:under|within|in|less than|max(?:imum)?(?: of)?)\s+\d{1,3}\s*(?:minutes?|mins?)\b/i,
    /\b(?:vegetarian|vegan|gluten[- ]free|dairy[- ]free|halal|kosher)\b/i,
    /\b(?:with|using)\s+(?:the\s+)?(?:oven|stove|stovetop|microwave|blender|air[- ]fryer)\b/i,
  ];
}

function avoidStopCues() {
  return [
    /\b(?:for|serves?|serving(?:s)?(?: for)?)\s+(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i,
    /\b(?:under|within|in|less than|max(?:imum)?(?: of)?)\s+\d{1,3}\s*(?:minutes?|mins?)\b/i,
    /\b(?:(?:use|using|with)\s+(?:the\s+)?(?:oven|stove|stovetop|microwave|blender|air[- ]fryer)(?:\s+only)?|(?:the\s+)?(?:oven|stove|stovetop|microwave|blender|air[- ]fryer)\s+only)\b/i,
    /\b(?:use|using|with)\s+(?:the\s+)?(?:oven|stove|stovetop|microwave|blender|air[- ]fryer)(?:\s+only)?\b/i,
    /[.;,]\s*(?:the\s+)?(?:oven|stove|stovetop|microwave|blender|air[- ]fryer)(?:\s+only)?\b/i,
    /\b(?:vegetarian|vegan|gluten[- ]free|dairy[- ]free|halal|kosher|(?:for\s+)?breakfast|(?:for\s+)?lunch|(?:for\s+)?dinner|(?:for\s+)?snack)\b/i,
  ];
}

function stopAtCue(segment, cues) {
  let endIndex = segment.length;

  for (const cue of cues) {
    const match = segment.match(cue);
    if (match?.index !== undefined && match.index < endIndex) {
      endIndex = match.index;
    }
  }

  return cleanText(segment.slice(0, endIndex).replace(/[.;,\s]+$/, ""));
}

function normalizeListPhrase(value) {
  return cleanText(value.replace(/\s*,\s*(?:and|plus)\s+/gi, ", ").replace(/\s+(?:and|plus)\s+/gi, ", "))
    .split(",")
    .map(cleanText)
    .filter(Boolean)
    .join(", ");
}

function boundedInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
