(() => {
  const container = document.getElementById("daily-quiz");
  let userId = "player_" + crypto.randomUUID();
  const fallback = {
    "daily.loading": "Loading daily quiz...",
    "daily.unavailable": "The daily quiz is not available yet.",
    "daily.loadError": "Could not load the daily quiz.",
    "daily.submitError": "Could not submit your answer. Please retry.",
    "daily.retry": "Retry",
    "daily.confirm": "Confirm",
    "daily.secondChance": "Are you certain? Or do you want to change your answer?",
    "daily.jokers": "Jokers",
    "daily.telephone": "phone",
    "daily.chat": "chat",
    "daily.next": "Next",
    "daily.finish": "Show results",
    "daily.submitting": "Submitting answers...",
    "daily.question": "Question",
    "daily.level": "Level",
    "daily.levelReached": "Level reached",
    "daily.jokersLeft": "Jokers left",
    "daily.share": "Share",
    "daily.copyResult": "Copy Result",
    "daily.copied": "Copied!",
    "daily.copyManually": "Copy this text to share your result:",
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
  let secondChanceUsed = false;
  let secondChanceOpen = false;
  const correctWarningChecked = [];
  let chatUsed = false;
  const chatPercentages = [];
  let selectedJoker = null;
  let telephoneHint;
  let telephonePosition;
  const eliminated = [];
  const levels = [
    "🧱 Brick",
    "🦠 Single Brain Cell",
    "🐠 Goldfish",
    "🐴 Donkey",
    "🐙 Octopus",
    "🪓 Caveman",
    "🧍 Average Joe",
    "🥚 Egghead",
    "🎮 Twitch Moderator",
    "💻 Wikipedia Editor",
    "👨‍🏫 Professor",
    "♟️ Chess Grandmaster",
    "👔 Quizzler CEO",
    "🌌 Galaxy Brain",
  ];

  const text = key => labels["daily." + key] || fallback["daily." + key];
  const levelName = index => labels["daily.level." + index] || levels[index];
  const attemptKey = () => "quizzler-daily-attempt:" + quizDate;
  function saveAttempt() {
    if (!quizDate || !["quiz", "results", "submitting", "submitError"].includes(state)) return;
    try {
      localStorage.setItem(attemptKey(), JSON.stringify({
        version: 1, ids: questions.map(q => q.id), userId, position, answers, results,
        state: state === "submitting" ? "submitError" : state,
        fiftyUsed, telephoneUsed, chatUsed, eliminated, chatPercentages,
        telephoneHint, telephonePosition, secondChanceUsed, secondChanceOpen, correctWarningChecked,
      }));
    } catch { /* Storage may be disabled by the browser. */ }
  }
  function restoreAttempt() {
    try {
      const saved = JSON.parse(localStorage.getItem(attemptKey()));
      if (!saved || saved.version !== 1 ||
          JSON.stringify(saved.ids) !== JSON.stringify(questions.map(q => q.id)) ||
          !["quiz", "results", "submitError"].includes(saved.state) ||
          !Number.isInteger(saved.position) || saved.position < 0 || saved.position >= questions.length ||
          !Array.isArray(saved.answers) || !Array.isArray(saved.results) ||
          !Array.isArray(saved.eliminated) || !Array.isArray(saved.chatPercentages) ||
          typeof saved.userId !== "string") return;
      userId = saved.userId;
      position = saved.position;
      answers.push(...saved.answers);
      results.push(...saved.results);
      eliminated.push(...saved.eliminated);
      chatPercentages.push(...saved.chatPercentages);
      fiftyUsed = Boolean(saved.fiftyUsed);
      telephoneUsed = Boolean(saved.telephoneUsed);
      secondChanceUsed = Boolean(saved.secondChanceUsed);
      secondChanceOpen = Boolean(saved.secondChanceOpen);
      if (Array.isArray(saved.correctWarningChecked)) correctWarningChecked.push(...saved.correctWarningChecked);
      chatUsed = Boolean(saved.chatUsed);
      telephoneHint = saved.telephoneHint;
      telephonePosition = saved.telephonePosition;
      state = saved.state;
    } catch { /* Ignore absent or invalid saved attempts. */ }
  }
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
    saveAttempt();
    container.dataset.state = state;
    const speech = document.getElementById("telephone-speech");
    if (speech) {
      speech.hidden = state !== "quiz" || (!secondChanceOpen && (!telephoneHint || telephonePosition !== position));
      if (!speech.hidden) {
        speech.textContent = secondChanceOpen ? text("secondChance") : window.TelephoneJoker.format(telephoneHint, questions[position], language);
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
      element("p", text("levelReached") + ": " + levelName(score));
      const jokersLeft = 3 - Number(fiftyUsed) - Number(telephoneUsed) - Number(chatUsed);
      element("p", text("jokersLeft") + ": " + jokersLeft);
      const shareText = [
        "🧢Quizzler Daily",
        "🏆 Level " + score + "/13: " + levelName(score),
        "🃏 Jokers left: " + jokersLeft,
        "Think you can beat me?",
        "https://quizzler.cc/daily",
      ].join("\n");
      const actions = element("div");
      actions.className = "result-actions";
      const share = button(text("share"), async () => {
        share.disabled = true;
        try {
          if (typeof navigator.share === "function") {
            try {
              await navigator.share({ text: shareText });
              return;
            } catch (error) {
              if (error.name === "AbortError") return;
            }
          }
          await copyResult();
        } finally {
          share.disabled = false;
        }
      }, actions);
      const copy = button(text("copyResult"), async () => {
        copy.disabled = true;
        try { await copyResult(); }
        finally { copy.disabled = false; }
      }, actions);
      const shareStatus = element("p");
      shareStatus.setAttribute("role", "status");
      let manualCopy;
      async function copyResult() {
        try {
          if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
          await navigator.clipboard.writeText(shareText);
          shareStatus.textContent = text("copied");
        } catch {
          shareStatus.textContent = text("copyManually");
          if (!manualCopy) {
            manualCopy = element("textarea", shareText);
            manualCopy.readOnly = true;
            manualCopy.rows = 5;
            manualCopy.setAttribute("aria-label", text("copyResult"));
          }
          manualCopy.focus();
          manualCopy.select();
        }
      }
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
    element("h2", levelName(position + 1));
    element("h2", questionText(question));
    const choices = element("div");
    choices.className = "answer-choices";
    options(question).forEach((option, index) => {
      const choice = button(option, () => {
        if (eliminated[position]?.includes(index)) return;
        answers[position] = index;
        secondChanceOpen = false;
        render();
      }, choices);
      choice.setAttribute("aria-pressed", String(answers[position] === index));
      if (chatPercentages[position]) {
        choice.textContent = "";
        const label = element("span", option, choice);
        label.className = "answer-label";
        const percentage = element("span", chatPercentages[position][index] + "%", choice);
        percentage.className = "answer-percentage";
        choice.className = "chat-answer";
      }
      choice.disabled = Boolean(eliminated[position]?.includes(index));
      if (eliminated[position]?.includes(index)) choice.className += " eliminated-answer";
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
    for (const [iconIndex, label] of ["50/50", text("telephone"), text("chat")].entries()) {
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
      joker.disabled = iconIndex === 0 ? fiftyUsed : iconIndex === 1 ? telephoneUsed : chatUsed;
      joker.setAttribute("aria-pressed", String(selectedJoker === iconIndex));
      joker.addEventListener("click", () => {
        if (state !== "quiz" || joker.disabled) return;
        if (selectedJoker !== iconIndex) {
          selectedJoker = iconIndex;
          render();
          return;
        }
        selectedJoker = null;
        if (iconIndex === 0) useFiftyFifty();
        else if (iconIndex === 1) {
          telephoneHint = window.TelephoneJoker.choose(questions[position]);
          telephonePosition = position;
          telephoneUsed = true;
          render();
        } else {
          chatPercentages[position] = window.ChatJoker.percentages(position + 1, questions[position].answer.correct_index);
          chatUsed = true;
          render();
        }
      });
    }
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(fitAnswerText);
  }

  function fitAnswerText() {
    if (state !== "quiz") return;
    container.querySelectorAll(".answer-choices button").forEach(choice => {
      choice.style.fontSize = "";
      let size = parseFloat(getComputedStyle(choice).fontSize);
      while (size > 10 && (choice.scrollHeight > choice.clientHeight ||
          choice.scrollWidth > choice.clientWidth)) {
        size--;
        choice.style.fontSize = size + "px";
      }
    });
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
        selectedJoker = null;
        telephoneUsed = false;
        secondChanceUsed = false;
        secondChanceOpen = false;
        correctWarningChecked.length = 0;
        chatUsed = false;
        chatPercentages.length = 0;
        telephoneHint = undefined;
        state = "quiz";
        restoreAttempt();
      }
    } catch (error) {
      console.error("Daily quiz load failed:", error);
      state = "loadError";
    }
    render();
  }

  async function submitCurrent() {
    if (state === "submitting" || !Number.isInteger(answers[position])) return;
    if (!secondChanceOpen) {
      const isCorrect = answers[position] === questions[position].answer.correct_index;
      let warn = false;
      if (!isCorrect && !secondChanceUsed) {
        secondChanceUsed = true;
        warn = true;
      } else if (isCorrect && !correctWarningChecked[position]) {
        correctWarningChecked[position] = true;
        warn = Math.random() < 0.08;
      }
      if (warn) {
        secondChanceOpen = true;
        render();
        return;
      }
    }
    secondChanceOpen = false;
    selectedJoker = null;
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
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(fitAnswerText).observe(container);
    document.fonts?.ready.then(fitAnswerText);
  }
  load();
})();
