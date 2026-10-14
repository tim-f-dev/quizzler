(() => {
  const start = document.getElementById("trivia-start");
  const categories = document.getElementById("trivia-categories");
  const status = document.getElementById("trivia-status");
  const question = document.getElementById("trivia-question");
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
  const text = (key, fallback) => labels["trivia." + key] || fallback;
  function renderCategories() {
    categories.replaceChildren();
    choices.forEach(([category, key, color]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text(key, category);
      button.style.background = "var(--color-" + color + ")";
      button.disabled = busy;
      button.addEventListener("click", () => load(key));
      categories.append(button);
    });
  }
  async function load(category) {
    if (busy) return;
    busy = true;
    renderCategories();
    question.hidden = true;
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
      question.textContent = result.question;
      question.hidden = false;
      status.textContent = "";
    } catch (error) {
      console.error("Trivia load failed:", error);
      status.textContent = text("error", "Could not load a question. Choose a category to retry.");
    } finally {
      busy = false;
      renderCategories();
    }
  }
  start.addEventListener("click", () => {
    start.hidden = true;
    categories.hidden = false;
    renderCategories();
  });
  document.addEventListener("languagechange", event => {
    language = event.detail.language;
    labels = event.detail.labels;
    renderCategories();
  });
})();
