import { buildRecipeRequestPayload } from "./recipe-payload.js";
import {
  mapServerRecipe,
  normalizeRecipeForDisplay,
  recipeMetaItems,
  recipeSourceLabel,
} from "./recipe-display.js";

const libraryKey = "cookooi-library-v1";

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
  generationStatus: document.querySelector("#generation-status"),
  proposalGrid: document.querySelector("#proposal-grid"),
  proposalTemplate: document.querySelector("#proposal-template"),
  libraryList: document.querySelector("#library-list"),
  dictateButton: document.querySelector("#dictate-button"),
  voiceStatus: document.querySelector("#voice-status"),
  clearResultsButton: document.querySelector("#clear-results-button"),
  clearLibraryButton: document.querySelector("#clear-library-button"),
};

let activeProposals = [];
let recognition = null;

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
    saveButton.textContent = "Saved";
    saveButton.disabled = true;
    card.classList.add("saved");
    renderLibrary();
  });

  return fragment;
}

function setGenerationStatus(message, tone = "neutral") {
  els.generationStatus.textContent = message;
  els.generationStatus.dataset.tone = tone;
}

function setGenerating(isGenerating) {
  els.generateButton.disabled = isGenerating;
  els.generateButton.textContent = isGenerating ? "Generating..." : "Get three meal ideas";
}

async function requestRecipeGeneration() {
  const payload = buildRecipeRequestPayload({
    ingredientsText: els.ingredients.value,
    craving: els.craving.value,
    avoid: els.avoid.value,
    diet: els.diet.value,
    servings: els.servings.value,
    maxTotalTimeMinutes: els.maxTotalTimeMinutes.value,
    cuisineOrFlavor: els.cuisineOrFlavor.value,
    equipment: els.equipment.filter((input) => input.checked).map((input) => input.value),
  });

  const response = await fetch("/api/recipes/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.message || "Cookooi could not generate recipes right now. Please try again.");
  }
  if (!Array.isArray(body.recipes) || body.recipes.length !== 3) {
    throw new Error("Cookooi returned an unexpected recipe response.");
  }

  return body;
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

  setGenerating(true);
  setGenerationStatus("Generating three Cookooi recipe proposals...", "neutral");

  try {
    const generation = await requestRecipeGeneration();
    activeProposals = generation.recipes.map((recipe, index) => mapServerRecipe(recipe, generation, index));
    renderProposals(activeProposals);
    if (generation.source === "fallback") {
      setGenerationStatus(
        generation.warning
          ? `Fallback results shown: ${generation.warning}`
          : "Fallback results shown because AI generation is unavailable.",
        "warning",
      );
    } else {
      setGenerationStatus("Three server-generated recipes are ready.", "success");
    }
  } catch (error) {
    activeProposals = [];
    renderProposals(activeProposals);
    setGenerationStatus(error.message, "error");
  } finally {
    setGenerating(false);
  }
});

els.dictateButton.addEventListener("click", () => {
  recognition?.start();
});

els.clearResultsButton.addEventListener("click", () => {
  activeProposals = [];
  renderProposals(activeProposals);
  setGenerationStatus("", "neutral");
});

els.clearLibraryButton.addEventListener("click", () => {
  saveLibrary([]);
  renderLibrary();
});

setupVoiceInput();
renderLibrary();
