import { buildRecipeRequestPayload } from "./recipe-payload.js";
import {
  getRecipeFeedback,
  getSessionId,
  markRecipeSaved,
  recordGenerationFailure,
  recordGenerationSuccess,
  recordRefinementFailure,
  recordRefinementSuccess,
  saveRecipeFeedback,
} from "./feedback-store.js";
import {
  mapServerRecipe,
  normalizeRecipeForDisplay,
  normalizeRefinementForDisplay,
  refinementFeasibilityLabel,
  recipeMetaItems,
  recipeOverviewCountLabel,
  recipeSourceLabel,
} from "./recipe-display.js";
import {
  clearSavedRecipes,
  clearSessionData,
  exportSessionData,
  importSessionData,
  isRecipeSaved,
  readSavedRecipeEntries,
  removeSavedRecipe,
  saveRecipeToLibrary,
  sessionSummary,
} from "./session-store.js";
import { readRecipeSettings, resetRecipeSettings, saveRecipeSettings } from "./settings-store.js";
import { parseVoiceNoteTranscript } from "./voice-note-parser.js";

const generationTimeoutMs = 30_000;
const sessionExportName = "cookooi-session-data.json";
const maxPreviousRecipeTitles = 12;

const els = {
  form: document.querySelector("#recipe-form"),
  ingredients: document.querySelector("#ingredients-input"),
  craving: document.querySelector("#craving-input"),
  avoid: document.querySelector("#avoid-input"),
  diet: document.querySelector("#diet-input"),
  mealType: document.querySelector("#meal-type-input"),
  servings: document.querySelector("#servings-input"),
  maxTotalTimeMinutes: document.querySelector("#time-input"),
  cuisineOrFlavor: document.querySelector("#cuisine-input"),
  equipment: Array.from(document.querySelectorAll("input[name='equipment']")),
  settingsToggleButton: document.querySelector("#settings-toggle-button"),
  settingsFields: document.querySelector("#settings-fields"),
  settingsSummary: document.querySelector("#settings-summary"),
  settingsStatus: document.querySelector("#settings-status"),
  saveSettingsButton: document.querySelector("#save-settings-button"),
  resetSettingsButton: document.querySelector("#reset-settings-button"),
  generateButton: document.querySelector("#generate-button"),
  tryMoreButton: document.querySelector("#try-more-button"),
  retryButton: document.querySelector("#retry-button"),
  generationStatus: document.querySelector("#generation-status"),
  proposalGrid: document.querySelector("#proposal-grid"),
  proposalTemplate: document.querySelector("#proposal-template"),
  libraryList: document.querySelector("#library-list"),
  dictateButton: document.querySelector("#dictate-button"),
  voiceStatus: document.querySelector("#voice-status"),
  voiceNote: document.querySelector("#voice-note-input"),
  parseVoiceButton: document.querySelector("#parse-voice-button"),
  clearVoiceButton: document.querySelector("#clear-voice-button"),
  voiceReviewPanel: document.querySelector("#voice-review-panel"),
  voiceReviewStatus: document.querySelector("#voice-review-status"),
  voiceIngredients: document.querySelector("#voice-ingredients-input"),
  voiceCraving: document.querySelector("#voice-craving-input"),
  voiceAvoid: document.querySelector("#voice-avoid-input"),
  voiceDiet: document.querySelector("#voice-diet-input"),
  voiceMealType: document.querySelector("#voice-meal-type-input"),
  voiceServings: document.querySelector("#voice-servings-input"),
  voiceMaxTotalTimeMinutes: document.querySelector("#voice-time-input"),
  voiceCuisineOrFlavor: document.querySelector("#voice-cuisine-input"),
  voiceEquipment: Array.from(document.querySelectorAll("input[name='voiceEquipment']")),
  clearResultsButton: document.querySelector("#clear-results-button"),
  clearLibraryButton: document.querySelector("#clear-library-button"),
  feedbackSummary: document.querySelector("#feedback-summary"),
  feedbackStatus: document.querySelector("#feedback-status"),
  exportFeedbackButton: document.querySelector("#export-feedback-button"),
  importFeedbackButton: document.querySelector("#import-feedback-button"),
  importFeedbackInput: document.querySelector("#import-feedback-input"),
  clearFeedbackButton: document.querySelector("#clear-feedback-button"),
};

let activeProposals = [];
let recognition = null;
let generationInFlight = false;
let lastSubmittedPayload = null;
let currentRecipeSettings = readRecipeSettings();
let voiceReviewActive = false;
let recognitionStarted = false;
let recognitionHadResult = false;
const sessionId = getSessionId();

function listItems(container, items, emptyText) {
  const visibleItems = Array.isArray(items) ? items : [];

  container.replaceChildren(
    ...(visibleItems.length ? visibleItems : [emptyText]).map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      if (!visibleItems.length) {
        li.className = "empty-list-item";
      }
      return li;
    }),
  );
}

function listMetaItems(container, items) {
  container.replaceChildren(
    ...items.map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    }),
  );
}

function renderRecipeDetails(root, recipe) {
  listMetaItems(root.querySelector(".recipe-detail-meta"), recipeMetaItems(recipe));
  listItems(root.querySelector(".used-list"), recipe.usesFromAvailableItems, "No available items listed.");
  listItems(root.querySelector(".missing-list"), recipe.itemsStillNeeded, "No extra items listed.");
  listItems(root.querySelector(".steps-list"), recipe.steps, "No preparation steps listed.");
  listItems(root.querySelector(".substitutions-list"), recipe.substitutions, "No substitutions listed.");
  listItems(root.querySelector(".dietary-list"), recipe.dietaryNotes, "No dietary notes provided.");
  listItems(root.querySelector(".allergy-list"), recipe.allergyNotes, "No allergy notes provided.");
  listItems(root.querySelector(".safety-list"), recipe.foodSafetyNotes, "No food-safety notes provided.");
  root.querySelector(".confidence-note").textContent = recipe.confidenceNotes || "No confidence note provided.";
  root.querySelector(".recipe-detail-source").textContent = recipeSourceLabel(recipe);
}

function renderRecipeOverview(root, recipe) {
  listMetaItems(root.querySelector(".recipe-overview-meta"), recipeMetaItems(recipe));
  root.querySelector(".recipe-overview-source").textContent = recipeSourceLabel(recipe);
  root.querySelector(".recipe-used-count").textContent = recipeOverviewCountLabel(recipe);
}

function setupRecipeRefinement(root, recipe) {
  const form = root.querySelector(".refinement-form");
  const question = root.querySelector(".refinement-question");
  const submitButton = root.querySelector(".refinement-submit-button");
  const status = root.querySelector(".refinement-status");
  const result = root.querySelector(".refinement-result");
  let refinementInFlight = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const questionText = cleanText(question.value);
    if (!questionText) {
      setRefinementStatus(status, "Add a question or requested change.", "error");
      return;
    }
    if (refinementInFlight) {
      return;
    }

    refinementInFlight = true;
    submitButton.disabled = true;
    submitButton.textContent = "Checking...";
    setRefinementStatus(status, "Checking this meal...", "neutral");
    result.hidden = true;

    try {
      const response = await requestRecipeRefinement(recipe, questionText);
      recordRefinementSuccess({ recipe, question: questionText, response, sessionId });
      renderRefinementResult(result, response);
      renderSessionSummary();
      setRefinementStatus(status, "Answer ready.", "success");
    } catch (error) {
      recordRefinementFailure({ recipe, question: questionText, error, sessionId });
      renderSessionSummary();
      setRefinementStatus(status, error.message, "error");
    } finally {
      refinementInFlight = false;
      submitButton.disabled = false;
      submitButton.textContent = "Ask Cookooi";
    }
  });
}

function setRefinementStatus(status, message, tone = "neutral") {
  status.textContent = message;
  status.dataset.tone = tone;
}

async function requestRecipeRefinement(recipe, question) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), generationTimeoutMs);
  let response;

  try {
    response = await fetch("/api/recipes/refine", {
      method: "POST",
      headers: { "content-type": "application/json", "x-cookooi-session": sessionId },
      body: JSON.stringify({
        recipe: recipePayloadForRefinement(recipe),
        question,
        generation: recipeGenerationMetadata(recipe),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw refinementError(
        "client_timeout",
        "Recipe follow-up took too long. Shorten the question and try again.",
        true,
      );
    }
    throw refinementError("network_error", "Cookooi could not reach the follow-up service. Please try again.", true);
  } finally {
    window.clearTimeout(timeout);
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw refinementError(
      body.error || "request_failed",
      friendlyRefinementMessage(body, response.status),
      isRetryableRefinementError(body.error, response.status),
    );
  }
  if (!body.refinement || typeof body.refinement !== "object") {
    throw refinementError("unexpected_response", "Cookooi returned an unexpected follow-up response. Try again.", true);
  }

  return body;
}

function refinementError(code, message, retryable) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function friendlyRefinementMessage(body, status) {
  const messages = {
    food_only: body.message,
    unsafe_request: body.message,
    invalid_request: body.message,
    invalid_json: "Cookooi could not read the follow-up. Refresh the page and try again.",
    provider_unavailable: "Recipe follow-up is not configured right now. You can try again later.",
    provider_rate_limited: "Cookooi is handling a lot of recipe requests. Please retry shortly.",
    provider_timeout: "Recipe follow-up took too long. Shorten the question and try again.",
    invalid_ai_output: "Cookooi received a follow-up response it could not trust. Try again.",
    provider_error: "Cookooi could not answer this follow-up right now. Please try again.",
    rate_limited: body.message,
  };

  return (
    messages[body.error] ||
    body.message ||
    (status >= 500 ? "Cookooi could not answer this follow-up right now. Please try again." : "Check the question and try again.")
  );
}

function isRetryableRefinementError(code, status) {
  return !["food_only", "invalid_request", "unsafe_request"].includes(code) && status !== 400;
}

function recipePayloadForRefinement(recipe) {
  return {
    title: recipe.title,
    summary: recipe.summary,
    usesFromAvailableItems: recipe.usesFromAvailableItems,
    itemsStillNeeded: recipe.itemsStillNeeded,
    steps: recipe.steps,
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    dietaryNotes: recipe.dietaryNotes,
    allergyNotes: recipe.allergyNotes,
    foodSafetyNotes: recipe.foodSafetyNotes,
    substitutions: recipe.substitutions,
    confidenceNotes: recipe.confidenceNotes,
  };
}

function recipeGenerationMetadata(recipe) {
  return {
    source: recipe.source,
    provider: recipe.provider,
    model: recipe.model,
    createdAt: recipe.createdAt,
  };
}

function renderRefinementResult(container, response) {
  const refinement = normalizeRefinementForDisplay(response);
  const heading = document.createElement("div");
  const title = document.createElement("h4");
  const feasibility = document.createElement("span");
  const explanation = document.createElement("p");
  const source = document.createElement("p");

  heading.className = "refinement-heading";
  title.textContent = "Suggested adjustment";
  feasibility.className = "refinement-feasibility";
  feasibility.textContent = refinementFeasibilityLabel(refinement.feasibility);
  explanation.textContent = refinement.explanation || "Cookooi returned a follow-up answer.";
  source.className = "refinement-source";
  source.textContent = recipeSourceLabel(refinement);

  heading.append(title, feasibility);
  container.replaceChildren(
    heading,
    explanation,
    refinementSection("Ingredient changes", refinement.modifiedIngredients),
    refinementSection("Step changes", refinement.modifiedSteps, "ol"),
    refinementSection("Allergy notes", refinement.allergyNotes),
    refinementSection("Food-safety notes", refinement.foodSafetyNotes),
    refinementTextSection("Confidence notes", refinement.confidenceNotes),
    source,
  );

  if (refinement.warning) {
    const warning = document.createElement("p");
    warning.className = "refinement-warning";
    warning.textContent = refinement.warning;
    container.append(warning);
  }
  if (refinement.proposedVariant) {
    container.append(renderProposedVariant(refinement.proposedVariant));
  }

  container.hidden = false;
}

function refinementSection(title, items, listTag = "ul") {
  const section = document.createElement("section");
  const heading = document.createElement("h5");
  const list = document.createElement(listTag);

  section.className = "refinement-section";
  heading.textContent = title;
  listItems(list, items, "No specific change listed.");
  section.append(heading, list);
  return section;
}

function refinementTextSection(title, text) {
  const section = document.createElement("section");
  const heading = document.createElement("h5");
  const paragraph = document.createElement("p");

  section.className = "refinement-section";
  heading.textContent = title;
  paragraph.textContent = text || "No confidence note provided.";
  section.append(heading, paragraph);
  return section;
}

function renderProposedVariant(variant) {
  const section = document.createElement("section");
  const title = document.createElement("h5");
  const summary = document.createElement("p");
  const meta = document.createElement("ul");
  const note = document.createElement("p");

  section.className = "variant-card";
  title.textContent = variant.title;
  summary.textContent = variant.summary;
  meta.className = "recipe-meta";
  listMetaItems(meta, recipeMetaItems(variant));
  note.className = "variant-note";
  note.textContent = "Original recipe remains unchanged.";

  section.append(
    title,
    summary,
    meta,
    refinementSection("Variant items used", variant.usesFromAvailableItems),
    refinementSection("Variant items still needed", variant.itemsStillNeeded),
    refinementSection("Variant steps", variant.steps, "ol"),
    note,
  );
  return section;
}

function setupRecipeDetailToggle(root) {
  const detailToggle = root.querySelector(".recipe-detail-toggle");
  const toggleText = root.querySelector(".recipe-toggle-text");
  const syncToggleText = () => {
    toggleText.textContent = detailToggle.open ? "Hide meal details" : "Open meal details";
  };

  syncToggleText();
  detailToggle.addEventListener("toggle", syncToggleText);
}

function renderProposal(recipeData) {
  const recipe = normalizeRecipeForDisplay(recipeData);
  const fragment = els.proposalTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".recipe-card");
  const saveButton = fragment.querySelector(".save-button");

  fragment.querySelector(".recipe-type").textContent = recipe.type;
  fragment.querySelector("h3").textContent = recipe.title;
  fragment.querySelector(".recipe-summary").textContent = recipe.summary;
  renderRecipeOverview(fragment, recipe);
  renderRecipeDetails(fragment, recipe);
  setupRecipeRefinement(fragment, recipe);
  setupRecipeDetailToggle(fragment);

  setSaveButtonState({ button: saveButton, card, saved: isRecipeSaved(recipe) });

  saveButton.addEventListener("click", () => {
    const generationId = recipe.createdAt ? `generation-${recipe.createdAt}` : "";
    saveRecipeToLibrary({ recipe, sessionId, generationId });
    markRecipeSaved(recipe);
    setSaveButtonState({ button: saveButton, card, saved: true });
    renderLibrary();
    renderSessionSummary();
  });

  fragment.querySelector(".recipe-interactions").append(createFeedbackPanel(recipe));

  return fragment;
}

function setSaveButtonState({ button, card, saved }) {
  button.textContent = saved ? "Saved" : "Save";
  button.disabled = saved;
  card.classList.toggle("saved", saved);
}

function createFeedbackPanel(recipe) {
  const savedFeedback = getRecipeFeedback(recipe.id);
  const panel = document.createElement("form");
  const heading = document.createElement("div");
  const title = document.createElement("h4");
  const ratingGroup = document.createElement("div");
  const upButton = feedbackRatingButton("Good fit", "up");
  const downButton = feedbackRatingButton("Needs work", "down");
  const label = document.createElement("label");
  const labelText = document.createElement("span");
  const note = document.createElement("textarea");
  const actions = document.createElement("div");
  const saveButton = document.createElement("button");
  const status = document.createElement("span");
  let selectedRating = savedFeedback?.rating || "";

  panel.className = "feedback-panel";
  title.textContent = "Tester feedback";
  heading.className = "feedback-heading";
  ratingGroup.className = "feedback-rating-group";
  ratingGroup.setAttribute("role", "group");
  ratingGroup.setAttribute("aria-label", `Rate ${recipe.title}`);
  label.className = "feedback-note field";
  labelText.textContent = "Optional note";
  note.maxLength = 500;
  note.rows = 2;
  note.value = savedFeedback?.note || "";
  note.placeholder = "What worked or did not work?";
  actions.className = "feedback-actions";
  saveButton.className = "secondary-button feedback-save-button";
  saveButton.type = "submit";
  saveButton.textContent = "Save feedback";
  status.className = "feedback-save-status";
  status.setAttribute("aria-live", "polite");
  status.textContent = savedFeedback ? "Saved locally." : "";

  const setSelectedRating = (rating) => {
    selectedRating = rating;
    for (const button of [upButton, downButton]) {
      button.setAttribute("aria-pressed", String(button.dataset.rating === selectedRating));
    }
  };

  upButton.addEventListener("click", () => setSelectedRating("up"));
  downButton.addEventListener("click", () => setSelectedRating("down"));

  panel.addEventListener("submit", (event) => {
    event.preventDefault();

    try {
      saveRecipeFeedback({ recipe, rating: selectedRating, note: note.value });
      status.textContent = "Saved locally.";
      renderSessionSummary();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  setSelectedRating(selectedRating);
  heading.append(title);
  ratingGroup.append(upButton, downButton);
  label.append(labelText, note);
  actions.append(saveButton, status);
  panel.append(heading, ratingGroup, label, actions);

  return panel;
}

function feedbackRatingButton(label, rating) {
  const button = document.createElement("button");
  button.className = "feedback-rating-button";
  button.type = "button";
  button.dataset.rating = rating;
  button.textContent = label;
  button.setAttribute("aria-pressed", "false");
  return button;
}

function setGenerationStatus(message, tone = "neutral") {
  els.generationStatus.textContent = message;
  els.generationStatus.dataset.tone = tone;
}

function setRetryVisible(isVisible) {
  els.retryButton.hidden = !isVisible;
  els.retryButton.disabled = !isVisible || generationInFlight;
}

function setTryMoreVisible(isVisible) {
  els.tryMoreButton.hidden = !isVisible;
  els.tryMoreButton.disabled = !isVisible || generationInFlight || !lastSubmittedPayload;
}

function setGenerating(isGenerating) {
  generationInFlight = isGenerating;
  els.form.setAttribute("aria-busy", String(isGenerating));
  els.proposalGrid.setAttribute("aria-busy", String(isGenerating));
  els.generateButton.disabled = isGenerating;
  els.generateButton.textContent = isGenerating ? "Generating..." : "Get three meal ideas";
  els.retryButton.disabled = isGenerating || !lastSubmittedPayload;
  els.tryMoreButton.disabled = isGenerating || !activeProposals.length || !lastSubmittedPayload;
}

function voiceReviewFieldValues() {
  return {
    ingredientsText: els.voiceIngredients.value,
    craving: els.voiceCraving.value,
    avoid: els.voiceAvoid.value,
    diet: els.voiceDiet.value,
    mealType: els.voiceMealType.value,
    servings: els.voiceServings.value,
    maxTotalTimeMinutes: els.voiceMaxTotalTimeMinutes.value,
    cuisineOrFlavor: els.voiceCuisineOrFlavor.value,
    equipment: els.voiceEquipment.filter((input) => input.checked).map((input) => input.value),
  };
}

function voiceConstraintOverrides() {
  const values = voiceReviewFieldValues();
  const overrides = {};

  for (const field of ["avoid", "diet", "mealType", "servings", "maxTotalTimeMinutes", "cuisineOrFlavor"]) {
    if (cleanText(values[field])) {
      overrides[field] = values[field];
    }
  }
  if (values.equipment.length) {
    overrides.equipment = values.equipment;
  }

  return overrides;
}

function buildCurrentRecipePayload() {
  if (voiceReviewActive) {
    const voiceValues = voiceReviewFieldValues();

    return buildRecipeRequestPayload(
      {
        ingredientsText: voiceValues.ingredientsText,
        craving: voiceValues.craving,
        ...voiceConstraintOverrides(),
      },
      currentRecipeSettings,
    );
  }

  return buildRecipeRequestPayload(
    {
      ingredientsText: els.ingredients.value,
      craving: els.craving.value,
    },
    currentRecipeSettings,
  );
}

function buildRegenerationPayload(payload, proposals) {
  const previousRecipeTitles = [
    ...(Array.isArray(payload?.previousRecipeTitles) ? payload.previousRecipeTitles : []),
    ...proposals.map((recipe) => recipe.title),
  ]
    .map(cleanText)
    .filter(Boolean);

  return {
    ...payload,
    constraints: { ...(payload.constraints || {}) },
    previousRecipeTitles: [...new Set(previousRecipeTitles)].slice(-maxPreviousRecipeTitles),
  };
}

async function requestRecipeGeneration(payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), generationTimeoutMs);
  let response;

  try {
    response = await fetch("/api/recipes/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-cookooi-session": sessionId },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw generationError(
        "client_timeout",
        "Recipe generation took too long. Retry, or shorten the request before trying again.",
        true,
      );
    }
    throw generationError("network_error", "Cookooi could not reach the recipe service. Please retry.", true);
  } finally {
    window.clearTimeout(timeout);
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw generationError(
      body.error || "request_failed",
      friendlyGenerationMessage(body, response.status),
      isRetryableGenerationError(body.error, response.status),
    );
  }
  if (!Array.isArray(body.recipes) || body.recipes.length !== 3) {
    throw generationError(
      "unexpected_response",
      "Cookooi returned an unexpected recipe response. Retry for a fresh set.",
      true,
    );
  }

  return body;
}

function generationError(code, message, retryable) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function friendlyGenerationMessage(body, status) {
  const messages = {
    food_only: body.message,
    invalid_request: body.message,
    invalid_json: "Cookooi could not read the request. Refresh the page and try again.",
    provider_unavailable: "Recipe generation is not configured right now. You can retry later.",
    provider_rate_limited: "Cookooi is handling a lot of recipe requests. Please retry shortly.",
    provider_timeout: "Recipe generation took too long. Retry, or shorten the request before trying again.",
    invalid_ai_output: "Cookooi received a recipe response it could not trust. Retry for a fresh set.",
    provider_error: "Cookooi could not generate recipes right now. Please retry.",
    rate_limited: body.message,
  };

  return (
    messages[body.error] ||
    body.message ||
    (status >= 500 ? "Cookooi could not generate recipes right now. Please retry." : "Check the request and try again.")
  );
}

function isRetryableGenerationError(code, status) {
  return !["food_only", "invalid_request"].includes(code) && status !== 400;
}

function renderProposals(proposals) {
  if (!proposals.length) {
    els.proposalGrid.innerHTML = `
      <article class="empty-state">
        <h3>Ready when you are.</h3>
        <p>Add ingredients to generate three starter recipes.</p>
      </article>
    `;
    setTryMoreVisible(false);
    return;
  }

  els.proposalGrid.replaceChildren(...proposals.map(renderProposal));
  setTryMoreVisible(true);
}

function renderLibrary() {
  const library = readSavedRecipeEntries();

  if (!library.length) {
    els.libraryList.innerHTML = `
      <article class="empty-state compact">
        <h3>No saved recipes yet.</h3>
        <p>Save any proposal to keep it in this browser.</p>
      </article>
    `;
    return;
  }

  els.libraryList.replaceChildren(
    ...library.map((entry) => {
      const displayRecipe = normalizeRecipeForDisplay(entry.recipe);
      const article = document.createElement("article");
      const details = document.createElement("div");
      const type = document.createElement("p");
      const title = document.createElement("h3");
      const summary = document.createElement("span");
      const savedMeta = document.createElement("p");
      const detailToggle = document.createElement("details");
      const detailSummary = document.createElement("summary");
      const detailBody = cloneSavedRecipeDetailBody();
      const removeButton = document.createElement("button");

      article.className = "library-item";
      type.textContent = displayRecipe.type;
      title.textContent = displayRecipe.title;
      summary.textContent = displayRecipe.summary;
      savedMeta.className = "saved-recipe-meta";
      savedMeta.textContent = savedRecipeMetaText(entry);
      detailToggle.className = "saved-recipe-details";
      detailSummary.textContent = "Recipe details";
      renderRecipeDetails(detailBody, displayRecipe);
      removeButton.className = "text-button danger";
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        removeSavedRecipe(displayRecipe.id);
        renderLibrary();
        renderSessionSummary();
      });

      details.append(type, title, summary, savedMeta);
      detailToggle.append(detailSummary, detailBody);
      details.append(detailToggle);
      article.append(details, removeButton);
      return article;
    }),
  );
}

function cloneSavedRecipeDetailBody() {
  const detailBody = els.proposalTemplate.content.cloneNode(true).querySelector(".recipe-body");
  detailBody.querySelector(".recipe-save-row")?.remove();
  detailBody.querySelector(".recipe-refinement")?.remove();
  return detailBody;
}

function savedRecipeMetaText(entry) {
  const savedAt = entry.savedAt ? new Date(entry.savedAt) : null;
  const savedDate = savedAt && !Number.isNaN(savedAt.valueOf()) ? savedAt.toLocaleString() : "";
  const source = [entry.source === "fallback" ? "fallback" : entry.provider || entry.source, entry.model]
    .filter(Boolean)
    .join(" ");

  return [savedDate ? `Saved ${savedDate}` : "", source ? `Source: ${source}` : "", entry.generationId ? "Linked to generation" : ""]
    .filter(Boolean)
    .join(" - ");
}

async function runGeneration(
  payload,
  statusMessage = "Generating three Cookooi recipe proposals...",
  { preserveProposalsOnError = false } = {},
) {
  if (generationInFlight) {
    return;
  }

  setRetryVisible(false);
  setGenerating(true);
  setGenerationStatus(statusMessage, "neutral");

  try {
    const generation = await requestRecipeGeneration(payload);
    activeProposals = generation.recipes.map((recipe, index) => mapServerRecipe(recipe, generation, index));
    recordGenerationSuccess({ payload, generation, recipes: activeProposals, sessionId });
    renderProposals(activeProposals);
    renderSessionSummary();
    if (generation.source === "fallback") {
      setGenerationStatus(
        generation.warning
          ? `Fallback results shown: ${generation.warning}`
          : "Fallback results shown because AI generation is unavailable.",
        "warning",
      );
    } else {
      setGenerationStatus("Three AI-generated recipe proposals are ready. Review safety notes before cooking.", "success");
    }
  } catch (error) {
    recordGenerationFailure({ payload, error, sessionId });
    if (!preserveProposalsOnError) {
      activeProposals = [];
    }
    renderProposals(activeProposals);
    renderSessionSummary();
    setGenerationStatus(error.message, "error");
    setRetryVisible(Boolean(error.retryable && lastSubmittedPayload));
  } finally {
    setGenerating(false);
  }
}

function renderSessionSummary() {
  const summary = sessionSummary();
  const totalItems = summary.generationCount + summary.refinementCount + summary.feedbackCount + summary.savedRecipeCount;

  els.feedbackSummary.textContent = `${summary.savedRecipeCount} saved recipes, ${summary.feedbackCount} ratings, ${summary.generationCount} generation records, ${summary.refinementCount} follow-ups.`;
  els.exportFeedbackButton.disabled = totalItems === 0;
  els.clearFeedbackButton.disabled = totalItems === 0;
}

function setFeedbackStatus(message, tone = "neutral") {
  els.feedbackStatus.textContent = message;
  els.feedbackStatus.dataset.tone = tone;
}

function setSettingsStatus(message, tone = "neutral") {
  els.settingsStatus.textContent = message;
  els.settingsStatus.dataset.tone = tone;
}

function setVoiceReviewStatus(message, tone = "neutral") {
  els.voiceReviewStatus.textContent = message;
  els.voiceReviewStatus.dataset.tone = tone;
}

function parseVoiceNote() {
  const parsed = parseVoiceNoteTranscript(els.voiceNote.value);

  applyVoiceParse(parsed);
}

function applyVoiceParse(parsed) {
  const constraints = parsed.constraints || {};

  voiceReviewActive = true;
  els.voiceReviewPanel.hidden = false;
  els.voiceIngredients.value = parsed.ingredientsText || "";
  els.voiceCraving.value = parsed.craving || "";
  els.voiceAvoid.value = constraints.avoid || "";
  els.voiceDiet.value = constraints.diet || "";
  els.voiceMealType.value = constraints.mealType || "";
  els.voiceServings.value = constraints.servings ? String(constraints.servings) : "";
  els.voiceMaxTotalTimeMinutes.value = constraints.maxTotalTimeMinutes ? String(constraints.maxTotalTimeMinutes) : "";
  els.voiceCuisineOrFlavor.value = constraints.cuisineOrFlavor || "";
  for (const input of els.voiceEquipment) {
    input.checked = Array.isArray(constraints.equipment) && constraints.equipment.includes(input.value);
  }
  syncVoiceReviewToPrimaryFields();

  if (parsed.ingredientsText) {
    setVoiceReviewStatus("Parsed fields are ready. Edit them here before generating.", "success");
  } else {
    setVoiceReviewStatus("Add available items to the parsed fields before generating.", "error");
  }
}

function syncVoiceReviewToPrimaryFields() {
  if (!voiceReviewActive) {
    return;
  }

  els.ingredients.value = els.voiceIngredients.value;
  els.craving.value = els.voiceCraving.value;
}

function clearVoiceNote() {
  voiceReviewActive = false;
  els.voiceNote.value = "";
  els.voiceReviewPanel.hidden = true;
  els.voiceIngredients.value = "";
  els.voiceCraving.value = "";
  els.voiceAvoid.value = "";
  els.voiceDiet.value = "";
  els.voiceMealType.value = "";
  els.voiceServings.value = "";
  els.voiceMaxTotalTimeMinutes.value = "";
  els.voiceCuisineOrFlavor.value = "";
  for (const input of els.voiceEquipment) {
    input.checked = false;
  }
  setVoiceReviewStatus("", "neutral");
  els.voiceStatus.textContent = recognition ? "Voice input ready." : "Speech capture unavailable; paste a transcript below.";
}

function settingsFieldValues() {
  return {
    avoid: els.avoid.value,
    diet: els.diet.value,
    mealType: els.mealType.value,
    servings: els.servings.value,
    maxTotalTimeMinutes: els.maxTotalTimeMinutes.value,
    cuisineOrFlavor: els.cuisineOrFlavor.value,
    equipment: els.equipment.filter((input) => input.checked).map((input) => input.value),
  };
}

function applySettingsToFields(settings) {
  els.avoid.value = settings.avoid || "";
  els.diet.value = settings.diet || "none";
  els.mealType.value = settings.mealType || "flexible";
  els.servings.value = settings.servings || 2;
  els.maxTotalTimeMinutes.value = settings.maxTotalTimeMinutes ? String(settings.maxTotalTimeMinutes) : "";
  els.cuisineOrFlavor.value = settings.cuisineOrFlavor || "";
  for (const input of els.equipment) {
    input.checked = settings.equipment.includes(input.value);
  }
}

function renderSettingsSummary() {
  const parts = [
    labelFromValue(currentRecipeSettings.mealType, "flexible", "Flexible meals"),
    labelFromValue(currentRecipeSettings.diet, "none", "No diet preference"),
    `Serves ${currentRecipeSettings.servings}`,
    currentRecipeSettings.maxTotalTimeMinutes ? `${currentRecipeSettings.maxTotalTimeMinutes} min` : "Any time",
    currentRecipeSettings.avoid ? "Avoidances saved" : "No avoidances",
    currentRecipeSettings.cuisineOrFlavor || "",
    currentRecipeSettings.equipment.length ? currentRecipeSettings.equipment.map(titleFromValue).join(", ") : "Any equipment",
  ].filter(Boolean);

  els.settingsSummary.textContent = parts.join(" - ");
}

function labelFromValue(value, defaultValue, defaultLabel) {
  return value === defaultValue ? defaultLabel : titleFromValue(value);
}

function titleFromValue(value) {
  return cleanText(value)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function exportSessionJson() {
  const blob = new Blob([exportSessionData()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = sessionExportName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setFeedbackStatus("Session export is ready.", "success");
}

async function importSessionJson(file) {
  try {
    importSessionData(JSON.parse(await file.text()));
    currentRecipeSettings = readRecipeSettings();
    applySettingsToFields(currentRecipeSettings);
    renderSettingsSummary();
    renderLibrary();
    renderSessionSummary();
    renderProposals(activeProposals);
    setFeedbackStatus("Session data imported.", "success");
  } catch (error) {
    setFeedbackStatus(error.message, "error");
  } finally {
    els.importFeedbackInput.value = "";
  }
}

function setupVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    els.voiceStatus.textContent = "Speech capture unavailable here. Use your keyboard microphone or paste a note below.";
    els.dictateButton.disabled = true;
    els.dictateButton.textContent = "Use keyboard mic";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.addEventListener("start", () => {
    recognitionStarted = true;
    recognitionHadResult = false;
    els.voiceStatus.textContent = "Listening for one note...";
    els.dictateButton.textContent = "Listening...";
  });

  recognition.addEventListener("result", (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(" ");
    recognitionHadResult = Boolean(transcript.trim());
    els.voiceNote.value = [els.voiceNote.value.trim(), transcript].filter(Boolean).join(" ");
    parseVoiceNote();
  });

  recognition.addEventListener("error", (event) => {
    recognitionStarted = false;
    recognitionHadResult = false;
    els.dictateButton.textContent = "Start voice note";
    els.voiceStatus.textContent = voiceRecognitionErrorMessage(event.error);
  });

  recognition.addEventListener("end", () => {
    els.voiceStatus.textContent =
      recognitionStarted && recognitionHadResult
        ? "Voice note ready to review."
        : "No voice note was captured. Check microphone permission, use your keyboard microphone, or paste a note below.";
    recognitionStarted = false;
    els.dictateButton.textContent = "Start voice note";
  });

  els.voiceStatus.textContent = "Voice input ready.";
}

function startVoiceRecognition() {
  if (!recognition) {
    els.voiceStatus.textContent = "Speech capture unavailable here. Use your keyboard microphone or paste a note below.";
    return;
  }

  try {
    recognition.start();
  } catch {
    els.voiceStatus.textContent = "Voice capture could not start. Use your keyboard microphone or paste a note below.";
    els.dictateButton.textContent = "Start voice note";
  }
}

function voiceRecognitionErrorMessage(errorCode) {
  const messages = {
    "not-allowed": "Microphone access was blocked. Allow microphone access, use your keyboard microphone, or paste a note below.",
    "service-not-allowed": "Speech capture is not available in this browser. Use your keyboard microphone or paste a note below.",
    "audio-capture": "Cookooi could not access the microphone. Check the device microphone or paste a note below.",
    network: "Speech capture needs browser speech service access. Use your keyboard microphone or paste a note below.",
    "no-speech": "No speech was captured. Try again, use your keyboard microphone, or paste a note below.",
    aborted: "Voice capture stopped. Try again or paste a note below.",
  };

  return messages[errorCode] || "Voice capture did not work here. Use your keyboard microphone or paste a note below.";
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (generationInFlight) {
    return;
  }

  lastSubmittedPayload = buildCurrentRecipePayload();
  await runGeneration(lastSubmittedPayload);
});

els.retryButton.addEventListener("click", async () => {
  if (!lastSubmittedPayload || generationInFlight) {
    return;
  }

  await runGeneration(lastSubmittedPayload, "Retrying recipe generation...");
});

els.tryMoreButton.addEventListener("click", async () => {
  if (!lastSubmittedPayload || generationInFlight || !activeProposals.length) {
    return;
  }

  lastSubmittedPayload = buildRegenerationPayload(lastSubmittedPayload, activeProposals);
  await runGeneration(lastSubmittedPayload, "Finding three more Cookooi meal ideas...", {
    preserveProposalsOnError: true,
  });
});

els.dictateButton.addEventListener("click", () => {
  startVoiceRecognition();
});

els.parseVoiceButton.addEventListener("click", parseVoiceNote);

els.clearVoiceButton.addEventListener("click", clearVoiceNote);

els.voiceIngredients.addEventListener("input", syncVoiceReviewToPrimaryFields);
els.voiceCraving.addEventListener("input", syncVoiceReviewToPrimaryFields);

els.settingsToggleButton.addEventListener("click", () => {
  const isExpanded = els.settingsToggleButton.getAttribute("aria-expanded") === "true";
  els.settingsToggleButton.setAttribute("aria-expanded", String(!isExpanded));
  els.settingsFields.hidden = isExpanded;
});

els.saveSettingsButton.addEventListener("click", () => {
  currentRecipeSettings = saveRecipeSettings(settingsFieldValues());
  applySettingsToFields(currentRecipeSettings);
  renderSettingsSummary();
  els.settingsToggleButton.setAttribute("aria-expanded", "false");
  els.settingsFields.hidden = true;
  setSettingsStatus("Settings saved in this browser.", "success");
});

els.resetSettingsButton.addEventListener("click", () => {
  currentRecipeSettings = resetRecipeSettings();
  applySettingsToFields(currentRecipeSettings);
  renderSettingsSummary();
  setSettingsStatus("Settings reset.", "neutral");
});

els.clearResultsButton.addEventListener("click", () => {
  activeProposals = [];
  renderProposals(activeProposals);
  setRetryVisible(false);
  setGenerationStatus("", "neutral");
});

els.clearLibraryButton.addEventListener("click", () => {
  clearSavedRecipes();
  renderLibrary();
  renderSessionSummary();
  renderProposals(activeProposals);
  setFeedbackStatus("Saved recipes cleared.", "neutral");
});

els.exportFeedbackButton.addEventListener("click", exportSessionJson);

els.importFeedbackButton.addEventListener("click", () => {
  els.importFeedbackInput.click();
});

els.importFeedbackInput.addEventListener("change", async () => {
  const [file] = els.importFeedbackInput.files || [];
  if (file) {
    await importSessionJson(file);
  }
});

els.clearFeedbackButton.addEventListener("click", () => {
  clearSessionData();
  renderLibrary();
  renderSessionSummary();
  renderProposals(activeProposals);
  setFeedbackStatus("Session data cleared. Settings kept.", "neutral");
});

setupVoiceInput();
applySettingsToFields(currentRecipeSettings);
renderSettingsSummary();
renderLibrary();
renderSessionSummary();

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
