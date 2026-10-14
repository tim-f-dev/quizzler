const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ""; }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  setAttribute() {}
  addEventListener(type, listener) { this[type] = listener; }
  style = {};
}

function fixture({ failAt, count = 10 } = {}) {
  const root = new Element("div");
  const listeners = {};
  const calls = [];
  let failed = false;
  const questions = Array.from({ length: count }, (_, index) => ({
    id: index + 1, type: "multiple_choice", question_en: "Question " + index,
    question_de: "Frage " + index,
    data: { options_en: ["A", "B", "C", "D"], options_de: ["AA", "BB", "CC", "DD"] },
  }));
  vm.runInNewContext(fs.readFileSync("public/scripts/daily.js", "utf8"), {
    document: {
      getElementById: () => root, createElement: tag => new Element(tag),
      documentElement: { lang: "en" },
      addEventListener: (name, listener) => { listeners[name] = listener; },
    },
    crypto: { randomUUID: () => "test-uuid" },
    window: { location: {} },
    console: { error() {} },
    fetch: async (url, options) => {
      if (url === "/api/daily") return { ok: true, json: async () => ({ date: "2026-10-14", questions }) };
      const body = JSON.parse(options.body);
      calls.push(body);
      if (body.question_id === failAt && !failed) {
        failed = true;
        return { ok: false, status: 500 };
      }
      return { ok: true, json: async () => ({
        is_correct: body.question_id <= 8, correct_answer: { correct_index: 2 },
      }) };
    },
  });
  function nodes(node = root) { return [node, ...node.children.flatMap(nodes)]; }
  return {
    calls, root, listeners,
    click(label) {
      const button = nodes().find(node => node.tag === "button" && node.textContent === label);
      assert(button, "Missing button " + label);
      assert(!button.disabled, "Disabled button " + label);
      button.click();
    },
    texts: () => nodes().map(node => node.textContent),
  };
}
const tick = () => new Promise(setImmediate);

test("ten questions, back navigation, no early feedback, score and bilingual review", async () => {
  const quiz = fixture();
  await tick();
  quiz.click("A"); quiz.click("Next"); quiz.click("Back");
  quiz.click("B");
  for (let index = 0; index < 10; index++) {
    if (index !== 0) quiz.click("A");
    assert.equal(quiz.calls.length, 0);
    assert(!quiz.texts().includes("Correct answer: C"));
    quiz.click(index === 9 ? "Show results" : "Next");
  }
  await tick();
  assert.equal(quiz.calls.length, 10);
  assert.equal(quiz.calls[0].answer.selected_index, 1);
  assert(quiz.calls.every(call => call.quiz_date === "2026-10-14" && call.user_id === "player_test-uuid"));
  assert(quiz.texts().includes("8/10 correct"));
  const rows = quiz.root.children.filter(node => node.tag === "section");
  assert.equal(rows.length, 10);
  assert.equal(rows.filter(node => node.style.color === "green").length, 8);
  assert.equal(rows.filter(node => node.style.color === "red").length, 2);
  quiz.listeners.languagechange({ detail: {
    language: "de", labels: JSON.parse(fs.readFileSync("public/translations/de.json", "utf8")),
  } });
  assert(quiz.texts().includes("8/10 richtig"));
  assert(quiz.texts().includes("Richtige Antwort: CC"));
});

test("retry retains successful submissions and delays results until completion", async () => {
  const quiz = fixture({ failAt: 5 });
  await tick();
  for (let index = 0; index < 10; index++) {
    quiz.click("A"); quiz.click(index === 9 ? "Show results" : "Next");
  }
  await tick();
  assert(!quiz.texts().includes("8/10 correct"));
  quiz.click("Retry"); await tick();
  assert.equal(quiz.calls.filter(call => call.question_id === 1).length, 1);
  assert.equal(quiz.calls.filter(call => call.question_id === 5).length, 2);
  assert(quiz.texts().includes("8/10 correct"));
});

test("incomplete daily quiz shows an unavailable message", async () => {
  const quiz = fixture({ count: 9 });
  await tick();
  assert(quiz.texts().some(text => text.includes("needs 10")));
  assert.equal(quiz.calls.length, 0);
});
