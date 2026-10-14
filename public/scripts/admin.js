(() => {
  const days = document.getElementById("days");
  const form = document.getElementById("editor");
  const fields = document.getElementById("questions");
  const status = document.getElementById("admin-status");
  const newDate = document.getElementById("new-date");
  const add = document.getElementById("new-day");
  let date;
  let creating = false;
  let dirty = false;
  let busy = false;
  let loadVersion = 0;
  const blank = () => ({
    type: "multiple_choice", question_en: "", question_de: "",
    data: { options_en: ["", "", "", ""], options_de: ["", "", "", ""] },
    answer: { correct_index: 0 }, category: "general", difficulty: 1,
  });
  async function api(url, options) {
    const response = await fetch(url, { cache: "no-store", ...options });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Request failed");
    return body;
  }
  const endpoint = value => "/api/admin/day?date=" + encodeURIComponent(value);
  function render(questions) {
    fields.replaceChildren();
    document.getElementById("editing-date").textContent = (creating ? "New day: " : "Editing: ") + date;
    questions.forEach((q, index) => {
      const section = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = "Question " + (index + 1);
      section.append(legend);
      function input(key, caption, value, type = "text") {
        const label = document.createElement("label");
        label.textContent = caption;
        const control = document.createElement("input");
        control.type = type;
        control.name = index + "." + key;
        control.value = value;
        control.required = true;
        if (type === "number") { control.min = "0"; control.step = "1"; }
        else control.maxLength = 2000;
        label.append(control);
        section.append(label);
        return control;
      }
      input("question_en", "Question (English)", q.question_en);
      input("question_de", "Question (German)", q.question_de);
      for (const lang of ["en", "de"]) {
        for (let option = 0; option < 4; option++) {
          input("option_" + lang + "_" + option, "Answer " + (option + 1) + " (" + lang + ")", q.data["options_" + lang][option]);
        }
      }
      const label = document.createElement("label");
      label.textContent = "Correct answer";
      const select = document.createElement("select");
      select.name = index + ".correct_index";
      for (let option = 0; option < 4; option++) {
        const item = document.createElement("option");
        item.value = option;
        item.textContent = "Answer " + (option + 1);
        select.append(item);
      }
      select.value = q.answer.correct_index;
      label.append(select);
      section.append(label);
      input("category", "Category", q.category);
      input("difficulty", "Difficulty", q.difficulty, "number");
      fields.append(section);
    });
    form.hidden = false;
    dirty = false;
  }
  async function refresh(selected = "") {
    const { days: dates } = await api("/api/admin/days");
    days.replaceChildren(new Option("Select a day", ""));
    dates.forEach(value => days.append(new Option(value, value)));
    days.value = selected;
  }
  function mayLeave() { return !dirty || window.confirm("Discard unsaved changes?"); }
  function lock(value) {
    busy = value;
    days.disabled = value;
    add.disabled = value;
    newDate.disabled = value;
    for (const control of form.elements) control.disabled = value;
  }
  form.addEventListener("input", () => { dirty = true; });
  days.addEventListener("change", async () => {
    if (!days.value || !mayLeave()) { days.value = creating ? "" : date || ""; return; }
    const selected = days.value;
    const version = ++loadVersion;
    lock(true);
    status.textContent = "Loading...";
    try {
      const quiz = await api(endpoint(selected));
      if (version !== loadVersion) return;
      date = selected;
      creating = false;
      render(quiz.questions);
      status.textContent = "";
    } catch (error) { status.textContent = error.message; }
    finally { lock(false); }
  });
  add.addEventListener("click", () => {
    if (busy || !newDate.value || !mayLeave()) return;
    if ([...days.options].some(option => option.value === newDate.value)) {
      status.textContent = "This day already exists. Select it above to edit."; return;
    }
    date = newDate.value;
    creating = true;
    days.value = "";
    render(Array.from({ length: 13 }, blank));
    status.textContent = "Fill in all 13 questions, then save to create the day.";
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(form);
    const questions = Array.from({ length: 13 }, (_, index) => {
      const value = key => data.get(index + "." + key);
      return {
        type: "multiple_choice", question_en: value("question_en"), question_de: value("question_de"),
        data: Object.fromEntries(["en", "de"].map(lang => [
          "options_" + lang, Array.from({ length: 4 }, (_, option) => value("option_" + lang + "_" + option)),
        ])),
        answer: { correct_index: Number(value("correct_index")) },
        category: value("category"), difficulty: Number(value("difficulty")),
      };
    });
    lock(true);
    status.textContent = "Saving...";
    try {
      await api(endpoint(date), {
        method: creating ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", "X-Quizzler-Admin": "1" },
        body: JSON.stringify({ questions }),
      });
      creating = false;
      dirty = false;
      document.getElementById("editing-date").textContent = "Editing: " + date;
      status.textContent = "Saved.";
      try { await refresh(date); } catch { status.textContent = "Saved, but the day list could not be refreshed. Reload to refresh it."; }
    } catch (error) { status.textContent = error.message; }
    finally { lock(false); }
  });
  window.addEventListener("beforeunload", event => {
    if (dirty) { event.preventDefault(); event.returnValue = ""; }
  });
  refresh().catch(error => { status.textContent = error.message; });
})();
