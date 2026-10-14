(() => {
  const container = document.getElementById("daily-quiz");
  const userId = "player_" + crypto.randomUUID();
  const fallback = {
    "daily.loading": "Loading daily quiz...",
    "daily.unavailable": "The daily quiz is not available yet.",
    "daily.loadError": "Could not load the daily quiz.",
    "daily.submitError": "Could not submit your answer. Please retry.",
    "daily.retry": "Retry",
    "daily.confirm": "Confirm",
    "daily.jokers": "Jokers",
    "daily.telephone": "phone",
    "daily.audience": "audience",
    "daily.next": "Next",
    "daily.finish": "Show results",
    "daily.submitting": "Submitting answers...",
    "daily.question": "Question",
    "daily.correct": "correct",
    "daily.wrong": "Wrong",
    "daily.showAnswers": "Show answers",
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
  let fiftyUsed = false;
  let telephoneUsed = false;
  let telephoneHint;
  let telephonePosition;
  const eliminated = [];

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
    const speech = document.getElementById("telephone-speech");
    if (speech) {
      speech.hidden = state !== "quiz" || !telephoneHint || telephonePosition !== position;
      if (!speech.hidden) {
        speech.textContent = window.TelephoneJoker.format(telephoneHint, questions[position], language);
      }
    }
    container.replaceChildren();
    if (state === "loading" || state === "submitting") {
      element("p", text(state));
      return;
    }
    if (state === "loadError" || state === "unavailable" || state === "submitError") {
      element("p", text(state));
      button(text("retry"), state === "submitError" ? submitCurrent : load);
      return;
    }
    if (state === "results") {
      const score = results.filter(result => result.is_correct).length;
      element("h2", score + " " + text("correct"));
      const accordion = element("details");
      element("summary", text("showAnswers"), accordion);
      questions.slice(0, results.length).forEach((question, index) => {
        const result = results[index];
        const row = element("section", undefined, accordion);
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
    element("p", text("question") + " " + (position + 1));
    element("h2", questionText(question));
    const choices = element("div");
    choices.className = "answer-choices";
    options(question).forEach((option, index) => {
      const choice = button(option, () => {
        if (eliminated[position]?.includes(index)) return;
        answers[position] = index;
        render();
      }, choices);
      choice.setAttribute("aria-pressed", String(answers[position] === index));
      choice.disabled = Boolean(eliminated[position]?.includes(index));
      if (eliminated[position]?.includes(index)) choice.className = "eliminated-answer";
    });
    const confirm = button(text("confirm"), submitCurrent);
    confirm.disabled = !Number.isInteger(answers[position]);
    element("h3", text("jokers"));
    const jokers = element("div");
    jokers.className = "joker-buttons";
    const jokerIcons = [
      [["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }], ["path", { d: "M12 3v18" }]],
      [["path", { d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" }]],
      [["path", { d: "M3 3v16a2 2 0 0 0 2 2h16" }], ["path", { d: "M18 17V9" }], ["path", { d: "M13 17V5" }], ["path", { d: "M8 17v-3" }]],
    ];
    for (const [iconIndex, label] of ["50/50", text("telephone"), text("audience")].entries()) {
      const joker = element("button", label, jokers);
      joker.type = "button";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      for (const [name, value] of Object.entries({
        width: "24", height: "24", viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round",
        "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false",
      })) svg.setAttribute(name, value);
      for (const [tag, attributes] of jokerIcons[iconIndex]) {
        const shape = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
        svg.append(shape);
      }
      joker.append(svg);
      if (label === "50/50") {
        joker.disabled = fiftyUsed;
        joker.addEventListener("click", useFiftyFifty);
      }
      if (label === text("telephone")) {
        joker.disabled = telephoneUsed;
        joker.addEventListener("click", () => {
          if (state !== "quiz" || telephoneUsed) return;
          telephoneHint = window.TelephoneJoker.choose(questions[position]);
          telephonePosition = position;
          telephoneUsed = true;
          render();
        });
      }
    }
  }

  function useFiftyFifty() {
    if (state !== "quiz" || fiftyUsed) return;
    const correctIndex = questions[position].answer.correct_index;
    const wrong = [0, 1, 2, 3].filter(index => index !== correctIndex);
    for (let index = wrong.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [wrong[index], wrong[other]] = [wrong[other], wrong[index]];
    }
    eliminated[position] = wrong.slice(0, 2);
    if (eliminated[position].includes(answers[position])) answers[position] = undefined;
    fiftyUsed = true;
    render();
  }

  async function load() {
    state = "loading";
    render();
    try {
      const response = await fetch("/api/daily");
      if (!response.ok) throw new Error("Daily API returned " + response.status);
      const quiz = await response.json();
      if (!Array.isArray(quiz.questions) || quiz.questions.length !== 13 ||
          !quiz.questions.every(question => question.type === "multiple_choice" &&
            Number.isInteger(question.answer?.correct_index) &&
            question.answer.correct_index >= 0 && question.answer.correct_index < 4 &&
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
        eliminated.length = 0;
        fiftyUsed = false;
        telephoneUsed = false;
        telephoneHint = undefined;
        state = "quiz";
      }
    } catch (error) {
      console.error("Daily quiz load failed:", error);
      state = "loadError";
    }
    render();
  }

  async function submitCurrent() {
    if (state === "submitting" || !Number.isInteger(answers[position])) return;
    state = "submitting";
    render();
    try {
      if (!results[position]) {
        const response = await fetch("/api/answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            question_id: questions[position].id,
            quiz_date: quizDate,
            answer: { selected_index: answers[position] },
          }),
        });
        if (!response.ok) throw new Error("Submit API returned " + response.status);
        const receipt = await response.json();
        if (receipt.saved !== true) throw new Error("Answer was not saved");
        results[position] = {
          is_correct: answers[position] === questions[position].answer.correct_index,
          correct_answer: questions[position].answer,
        };
      }
      if (!results[position].is_correct || position === questions.length - 1) {
        state = "results";
      } else {
        position++;
        state = "quiz";
      }
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
