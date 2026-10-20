(() => {
  const start = document.getElementById("trivia-start");
  const intro = document.getElementById("trivia-intro");
  const categories = document.getElementById("trivia-categories");
  const status = document.getElementById("trivia-status");
  const question = document.getElementById("trivia-question");
  const questionText = document.getElementById("trivia-question-text");
  const title = document.getElementById("trivia-title");
  const scene = document.getElementById("trivia-card-scene");
  const card = document.getElementById("trivia-card");
  const back = document.getElementById("trivia-card-back");
  const answer = document.getElementById("trivia-answer");
  const next = document.getElementById("trivia-continue");
  let selectedCategory;
  const choices = [
    ["Geography", "geography", "blue"],
    ["Entertainment", "entertainment", "red"],
    ["History", "history", "gold"],
    ["Arts & Literature", "arts", "purple"],
    ["Science & Nature", "science", "green"],
    ["Sports & Leisure", "sports", "teal"],
  ];
  let language = document.documentElement.lang === "de" ? "de" : "en";
  let labels = {};
  let busy = false;
  const categoryIcons = Array.from(document.querySelectorAll(".trivia-category-preview svg"));
  const text = (key, fallback) => labels["trivia." + key] || fallback;
  function renderCategories() {
    categories.replaceChildren();
    choices.forEach(([category, key, color], index) => {
      const button = document.createElement("button");
      button.type = "button";
      if (categoryIcons[index]) button.append(categoryIcons[index].cloneNode(true));
      const label = document.createElement("span");
      label.textContent = text(key, category);
      button.append(label);
      button.style.color = "var(--color-" + color + ")";
      button.disabled = busy;
      button.addEventListener("click", () => load(key));
      categories.append(button);
    });
  }
  async function load(category) {
    if (busy) return;
    busy = true;
    renderCategories();
    categories.hidden = true;
    scene.hidden = true;
    status.textContent = text("loading", "Loading question...");
    try {
      const query = new URLSearchParams({ language, category });
      const response = await fetch("/api/trivia/random?" + query, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        status.textContent = response.status === 404
          ? text("empty", "No question is available for this category.")
          : text("error", "Could not load a question. Choose a category to retry.");
        return;
      }
      if (typeof result.question !== "string") throw new Error("Invalid question response");
      if (result.answer === null || result.answer === undefined) throw new Error("Missing answer");
      selectedCategory = choices.find(choice => choice[1] === category);
      title.textContent = text(selectedCategory[1], selectedCategory[0]);
      title.style.color = "var(--color-" + selectedCategory[2] + ")";
      scene.style.setProperty("--category-color", "var(--color-" + selectedCategory[2] + ")");
      questionText.textContent = result.question;
      answer.textContent = typeof result.answer === "string" ? result.answer : JSON.stringify(result.answer);
      card.classList.remove("is-flipped");
      back.inert = true;
      back.setAttribute("aria-hidden", "true");
      question.inert = false;
      question.removeAttribute("aria-hidden");
      scene.hidden = false;
      question.focus({ preventScroll: true });
      status.textContent = "";
    } catch (error) {
      console.error("Trivia load failed:", error);
      status.textContent = text("error", "Could not load a question. Choose a category to retry.");
    } finally {
      busy = false;
      renderCategories();
      if (scene.hidden) categories.hidden = false;
    }
  }
  question.addEventListener("click", () => {
    if (scene.hidden || card.classList.contains("is-flipped")) return;
    card.classList.add("is-flipped");
    question.inert = true;
    question.setAttribute("aria-hidden", "true");
    back.inert = false;
    back.removeAttribute("aria-hidden");
    next.focus({ preventScroll: true });
  });
  next.addEventListener("click", () => {
    scene.hidden = true;
    card.classList.remove("is-flipped");
    title.textContent = "Trivial Pursuit";
    title.style.color = "";
    categories.hidden = false;
    status.textContent = "";
    renderCategories();
    const index = choices.indexOf(selectedCategory);
    categories.children[index]?.focus({ preventScroll: true });
  });
  start.addEventListener("click", () => {
    start.hidden = true;
    intro.hidden = true;
    title.removeAttribute("data-i18n");
    title.textContent = "Trivial Pursuit";
    categories.hidden = false;
    renderCategories();
  });
  document.addEventListener("languagechange", event => {
    language = event.detail.language;
    labels = event.detail.labels;
    if (!scene.hidden && selectedCategory) title.textContent = text(selectedCategory[1], selectedCategory[0]);
    renderCategories();
  });
})();
