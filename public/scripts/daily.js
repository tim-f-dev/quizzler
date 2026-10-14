(() => {
  const container = document.getElementById("daily-quiz");
  const userId = "player_" + crypto.randomUUID();
  const fallback = {
    "daily.loading": "Loading daily quiz...",
    "daily.unavailable": "The daily quiz needs 10 multiple-choice questions with four answers each.",
    "daily.loadError": "Could not load the daily quiz.",
    "daily.submitError": "Could not submit all answers. Please retry.",
    "daily.retry": "Retry",
    "daily.back": "Back",
    "daily.next": "Next",
    "daily.finish": "Show results",
    "daily.submitting": "Submitting answers...",
    "daily.question": "Question",
    "daily.correct": "correct",
    "daily.wrong": "Wrong",
    "daily.correctAnswer": "Correct answer",
    "daily.yourAnswer": "Your answer",
  };
  let labels = fallback;
  let language = document.documentElement.lang === "de" ? "de" : "en";
  let questions = [];
  let quizDate;
  let position = 0;
  const answers = [];
  const results = [];
  let state = "loading";

  const text = key => labels["daily." + key] || fallback["daily." + key];
  function element(tag, content, parent = container) {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    parent.append(node);
    return node;
  }
  function button(content, action, parent = container) {
    const node = element("button", content, parent);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }
  function options(question) {
    return question.data["options_" + language] || question.data.options_en;
  }
  function questionText(question) {
    return question["question_" + language] || question.question_en;
  }

  function render() {
    container.replaceChildren();
    if (state === "loading" || state === "submitting") {
      element("p", text(state));
      return;
    }
    if (state === "loadError" || state === "unavailable" || state === "submitError") {
      element("p", text(state));
      button(text("retry"), state === "submitError" ? submitAll : load);
      return;
    }
    if (state === "results") {
      const score = results.filter(result => result.is_correct).length;
      element("h2", score + "/" + questions.length + " " + text("correct"));
      questions.forEach((question, index) => {
        const result = results[index];
        const row = element("section");
        row.style.color = result.is_correct ? "green" : "red";
        element("h3", (index + 1) + ". " + questionText(question), row);
        element("p", result.is_correct ? text("correct") : text("wrong"), row);
        element("p", text("yourAnswer") + ": " + options(question)[answers[index]], row);
        element("p", text("correctAnswer") + ": " +
          options(question)[result.correct_answer.correct_index], row);
      });
      return;
    }

    const question = questions[position];
    element("p", text("question") + " " + (position + 1) + "/" + questions.length);
    element("h2", questionText(question));
    const choices = element("div");
    options(question).forEach((option, index) => {
      const choice = button(option, () => {
        answers[position] = index;
        if (position === questions.length - 1) submitAll();
        else { position++; render(); }
      }, choices);
      choice.setAttribute("aria-pressed", String(answers[position] === index));
    });
    button(text("back"), () => {
      if (position === 0) window.location.href = "../";
      else { position--; render(); }
    });
  }

  async function load() {
    state = "loading";
    render();
    try {
      const response = await fetch("/api/daily");
      if (!response.ok) throw new Error("Daily API returned " + response.status);
      const quiz = await response.json();
      if (!Array.isArray(quiz.questions) || quiz.questions.length !== 10 ||
          !quiz.questions.every(question => question.type === "multiple_choice" &&
            Array.isArray(question.data?.options_en) && question.data.options_en.length === 4 &&
            (!question.data.options_de || (Array.isArray(question.data.options_de) &&
              question.data.options_de.length === 4)))) {
        state = "unavailable";
      } else {
        questions = quiz.questions;
        quizDate = quiz.date;
        position = 0;
        answers.length = 0;
        results.length = 0;
        state = "quiz";
      }
    } catch (error) {
      console.error("Daily quiz load failed:", error);
      state = "loadError";
    }
    render();
  }

  async function submitAll() {
    if (state === "submitting" || answers.filter(Number.isInteger).length !== questions.length) return;
    state = "submitting";
    render();
    try {
      for (let index = 0; index < questions.length; index++) {
        // Keep successful submissions when retrying a partially failed batch.
        if (results[index]) continue;
        const response = await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            question_id: questions[index].id,
            quiz_date: quizDate,
            answer: { selected_index: answers[index] },
          }),
        });
        if (!response.ok) throw new Error("Submit API returned " + response.status);
        const result = await response.json();
        if (typeof result.is_correct !== "boolean" ||
            !Number.isInteger(result.correct_answer?.correct_index) ||
            result.correct_answer.correct_index < 0 || result.correct_answer.correct_index > 3) {
          throw new Error("Invalid submission result");
        }
        results[index] = result;
      }
      state = "results";
    } catch (error) {
      console.error("Daily quiz submission failed:", error);
      state = "submitError";
    }
    render();
  }

  document.addEventListener("languagechange", event => {
    language = event.detail.language;
    labels = event.detail.labels;
    render();
  });
  load();
})();
