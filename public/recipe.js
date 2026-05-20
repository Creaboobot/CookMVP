import { buildRecipeRequestPayload } from "./recipe-payload.js";
import {
  clearFeedbackData,
  exportFeedbackData,
  feedbackSummary,
  getRecipeFeedback,
  getSessionId,
  importFeedbackData,
  markRecipeSaved,
  recordGenerationFailure,
  recordGenerationSuccess,
  saveRecipeFeedback,
} from "./feedback-store.js";
import {
  mapServerRecipe,
  normalizeRecipeForDisplay,
  recipeMetaItems,
  recipeSourceLabel,
} from "./recipe-display.js";

const libraryKey = "cookooi-library-v1";
const generationTimeoutMs = 30_000;
const feedbackExportName = "cookooi-feedback.json";

const els = {
  form: document.querySelector("#recipe-form"),
  ingredients: document.querySelector("#ingredients-input"),
  craving: document.querySelector("#craving-input"),
  avoid: document.querySelector("#avoid-input"),
  diet: document.querySelector("#diet-input"),
  servings: document.querySelector("#servings-input"),
  maxTotalTimeMinutes: document.querySelector("#time-input"),
  cuisineOrFlavor: document.querySelector("#cuisine-input"),
  equipment: Array.from(document.querySelectorAll("input[name='equipment']")),
  generateButton: document.querySelector("#generate-button"),
  retryButton: document.querySelector("#retry-button"),
  generationStatus: document.querySelector("#generation-status"),
  proposalGrid: document.querySelector("#proposal-grid"),
  proposalTemplate: document.querySelector("#proposal-template"),
  libraryList: document.querySelector("#library-list"),
  dictateButton: document.querySelector("#dictate-button"),
  voiceStatus: document.querySelector("#voice-status"),
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
const sessionId = getSessionId();

function loadLibrary() {
  return JSON.parse(localStorage.getItem(libraryKey) || "[]");
}

function saveLibrary(recipes) {
  localStorage.setItem(libraryKey, JSON.stringify(recipes));
}

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
  listMetaItems(root.querySelector(".recipe-meta"), recipeMetaItems(recipe));
  listItems(root.querySelector(".used-list"), recipe.usesFromAvailableItems, "No available items listed.");
  listItems(root.querySelector(".missing-list"), recipe.itemsStillNeeded, "No extra items listed.");
  listItems(root.querySelector(".steps-list"), recipe.steps, "No preparation steps listed.");
  listItems(root.querySelector(".substitutions-list"), recipe.substitutions, "No substitutions listed.");
  listItems(root.querySelector(".dietary-list"), recipe.dietaryNotes, "No dietary notes provided.");
  listItems(root.querySelector(".allergy-list"), recipe.allergyNotes, "No allergy notes provided.");
  listItems(root.querySelector(".safety-list"), recipe.foodSafetyNotes, "No food-safety notes provided.");
  root.querySelector(".confidence-note").textContent = recipe.confidenceNotes || "No confidence note provided.";
  root.querySelector(".recipe-source").textContent = recipeSourceLabel(recipe);
}

function renderProposal(recipeData) {
  const recipe = normalizeRecipeForDisplay(recipeData);
  const fragment = els.proposalTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".recipe-card");
  const saveButton = fragment.querySelector(".save-button");

  fragment.querySelector(".recipe-type").textContent = recipe.type;
  fragment.querySelector("h3").textContent = recipe.title;
  fragment.querySelector(".recipe-summary").textContent = recipe.summary;
  renderRecipeDetails(fragment, recipe);

  saveButton.addEventListener("click", () => {
    const library = loadLibrary();
    if (!library.some((savedRecipe) => savedRecipe.title === recipe.title && savedRecipe.summary === recipe.summary)) {
      saveLibrary([recipe, ...library]);
    }
    markRecipeSaved(recipe);
    saveButton.textContent = "Saved";
    saveButton.disabled = true;
    card.classList.add("saved");
    renderLibrary();
    renderFeedbackSummary();
  });

  card.append(createFeedbackPanel(recipe));

  return fragment;
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
      renderFeedbackSummary();
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

function setGenerating(isGenerating) {
  generationInFlight = isGenerating;
  els.form.setAttribute("aria-busy", String(isGenerating));
  els.proposalGrid.setAttribute("aria-busy", String(isGenerating));
  els.generateButton.disabled = isGenerating;
  els.generateButton.textContent = isGenerating ? "Generating..." : "Get three meal ideas";
  els.retryButton.disabled = isGenerating || !lastSubmittedPayload;
}

function buildCurrentRecipePayload() {
  return buildRecipeRequestPayload({
    ingredientsText: els.ingredients.value,
    craving: els.craving.value,
    avoid: els.avoid.value,
    diet: els.diet.value,
    servings: els.servings.value,
    maxTotalTimeMinutes: els.maxTotalTimeMinutes.value,
    cuisineOrFlavor: els.cuisineOrFlavor.value,
    equipment: els.equipment.filter((input) => input.checked).map((input) => input.value),
  });
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
        <p>Add ingredients and a craving to generate three starter recipes.</p>
      </article>
    `;
    return;
  }

  els.proposalGrid.replaceChildren(...proposals.map(renderProposal));
}

function renderLibrary() {
  const library = loadLibrary();

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
    ...library.map((recipe) => {
      const displayRecipe = normalizeRecipeForDisplay(recipe);
      const article = document.createElement("article");
      const details = document.createElement("div");
      const type = document.createElement("p");
      const title = document.createElement("h3");
      const summary = document.createElement("span");
      const detailToggle = document.createElement("details");
      const detailSummary = document.createElement("summary");
      const detailBody = els.proposalTemplate.content.cloneNode(true).querySelector(".recipe-body");
      const removeButton = document.createElement("button");

      article.className = "library-item";
      type.textContent = displayRecipe.type;
      title.textContent = displayRecipe.title;
      summary.textContent = displayRecipe.summary;
      detailToggle.className = "saved-recipe-details";
      detailSummary.textContent = "Recipe details";
      renderRecipeDetails(detailBody, displayRecipe);
      removeButton.className = "text-button danger";
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        saveLibrary(loadLibrary().filter((savedRecipe) => savedRecipe.id !== displayRecipe.id));
        renderLibrary();
      });

      details.append(type, title, summary);
      detailToggle.append(detailSummary, detailBody);
      details.append(detailToggle);
      article.append(details, removeButton);
      return article;
    }),
  );
}

async function runGeneration(payload, statusMessage = "Generating three Cookooi recipe proposals...") {
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
    renderFeedbackSummary();
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
    activeProposals = [];
    renderProposals(activeProposals);
    renderFeedbackSummary();
    setGenerationStatus(error.message, "error");
    setRetryVisible(Boolean(error.retryable && lastSubmittedPayload));
  } finally {
    setGenerating(false);
  }
}

function renderFeedbackSummary() {
  const summary = feedbackSummary();
  const totalItems = summary.generationCount + summary.feedbackCount + summary.savedRecipeCount;

  els.feedbackSummary.textContent = `${summary.feedbackCount} ratings, ${summary.generationCount} generation records, ${summary.savedRecipeCount} saved recipe markers.`;
  els.exportFeedbackButton.disabled = totalItems === 0;
  els.clearFeedbackButton.disabled = totalItems === 0;
}

function setFeedbackStatus(message, tone = "neutral") {
  els.feedbackStatus.textContent = message;
  els.feedbackStatus.dataset.tone = tone;
}

function exportFeedbackJson() {
  const blob = new Blob([exportFeedbackData()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = feedbackExportName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setFeedbackStatus("Feedback export is ready.", "success");
}

async function importFeedbackJson(file) {
  try {
    importFeedbackData(JSON.parse(await file.text()));
    renderFeedbackSummary();
    renderProposals(activeProposals);
    setFeedbackStatus("Feedback data imported.", "success");
  } catch (error) {
    setFeedbackStatus(error.message, "error");
  } finally {
    els.importFeedbackInput.value = "";
  }
}

function setupVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    els.voiceStatus.textContent = "Voice input unavailable; text input works.";
    els.dictateButton.disabled = true;
    els.dictateButton.textContent = "Voice unavailable";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.addEventListener("start", () => {
    els.voiceStatus.textContent = "Listening for ingredients...";
    els.dictateButton.textContent = "Listening...";
  });

  recognition.addEventListener("result", (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(", ");
    els.ingredients.value = [els.ingredients.value.trim(), transcript].filter(Boolean).join(", ");
  });

  recognition.addEventListener("end", () => {
    els.voiceStatus.textContent = "Voice input ready.";
    els.dictateButton.textContent = "Dictate ingredients";
  });

  els.voiceStatus.textContent = "Voice input ready.";
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

els.dictateButton.addEventListener("click", () => {
  recognition?.start();
});

els.clearResultsButton.addEventListener("click", () => {
  activeProposals = [];
  renderProposals(activeProposals);
  setRetryVisible(false);
  setGenerationStatus("", "neutral");
});

els.clearLibraryButton.addEventListener("click", () => {
  saveLibrary([]);
  renderLibrary();
});

els.exportFeedbackButton.addEventListener("click", exportFeedbackJson);

els.importFeedbackButton.addEventListener("click", () => {
  els.importFeedbackInput.click();
});

els.importFeedbackInput.addEventListener("change", async () => {
  const [file] = els.importFeedbackInput.files || [];
  if (file) {
    await importFeedbackJson(file);
  }
});

els.clearFeedbackButton.addEventListener("click", () => {
  clearFeedbackData();
  renderFeedbackSummary();
  renderProposals(activeProposals);
  setFeedbackStatus("Feedback data cleared.", "neutral");
});

setupVoiceInput();
renderLibrary();
renderFeedbackSummary();
