const libraryKey = "cookooi-library-v1";

const els = {
  form: document.querySelector("#recipe-form"),
  ingredients: document.querySelector("#ingredients-input"),
  craving: document.querySelector("#craving-input"),
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

function listItems(container, items) {
  container.replaceChildren(
    ...items.map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    }),
  );
}

function renderProposal(recipe) {
  const fragment = els.proposalTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".recipe-card");
  const saveButton = fragment.querySelector(".save-button");

  fragment.querySelector(".recipe-type").textContent = recipe.type;
  fragment.querySelector("h3").textContent = recipe.title;
  fragment.querySelector(".recipe-summary").textContent = recipe.summary;
  listItems(fragment.querySelector(".used-list"), recipe.used);
  listItems(fragment.querySelector(".missing-list"), recipe.missing);

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

function mapServerRecipe(recipe, generation, index) {
  const createdAt = generation.createdAt || new Date().toISOString();

  return {
    id: `${createdAt}-${index}`,
    type: generation.source === "fallback" ? "Fallback result" : `${recipe.difficulty} recipe`,
    title: recipe.title,
    summary: recipe.summary,
    used: recipe.usesFromAvailableItems,
    missing: recipe.itemsStillNeeded,
    source: generation.source || "ai",
    provider: generation.provider,
    model: generation.model,
    createdAt,
  };
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
  const response = await fetch("/api/recipes/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ingredientsText: els.ingredients.value,
      craving: els.craving.value,
      constraints: {},
    }),
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
      const article = document.createElement("article");
      const details = document.createElement("div");
      const type = document.createElement("p");
      const title = document.createElement("h3");
      const summary = document.createElement("span");
      const removeButton = document.createElement("button");

      article.className = "library-item";
      type.textContent = recipe.type;
      title.textContent = recipe.title;
      summary.textContent = recipe.summary;
      removeButton.className = "text-button danger";
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        saveLibrary(loadLibrary().filter((savedRecipe) => savedRecipe.id !== recipe.id));
        renderLibrary();
      });

      details.append(type, title, summary);
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
