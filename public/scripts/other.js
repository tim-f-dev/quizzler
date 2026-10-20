(() => {
  const button = document.getElementById("reset-daily");
  const status = document.getElementById("reset-daily-status");
  let labels = {};
  const text = (key, fallback) => labels[key] || fallback;
  document.addEventListener("languagechange", event => { labels = event.detail.labels; });
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = text("other.resetting", "Resetting daily quiz...");
    try {
      const response = await fetch("/api/daily", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load active quiz");
      const quiz = await response.json();
      if (typeof quiz.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(quiz.date)) {
        throw new Error("Invalid quiz date");
      }
      localStorage.removeItem("quizzler-daily-attempt:" + quiz.date);
      const language = window.location.pathname.split("/")[1] === "de" ? "de" : "en";
      window.location.assign("/" + language + "/daily/");
    } catch (error) {
      console.error("Daily reset failed:", error);
      status.textContent = text("other.resetError", "Could not reset the quiz. Please try again and allow browser storage.");
      button.disabled = false;
    }
  });
})();
