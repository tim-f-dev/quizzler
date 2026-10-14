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

function fixture({ failAt, count = 13, wrongAt = 9 } = {}) {
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
        is_correct: body.question_id !== wrongAt, correct_answer: { correct_index: 2 },
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

test("first wrong answer ends the quiz with collapsed answer accordions", async () => {
 const quiz=fixture(); await tick();
 for(let index=1;index<=9;index++) {
  assert(quiz.texts().includes('Question '+index));
  assert(!quiz.texts().some(text=>text.includes('/13')));
  quiz.click('A'); quiz.click('Confirm'); await tick();
 }
 assert.equal(quiz.calls.length,9);
 assert(quiz.texts().includes('8 correct'));
 const rows=quiz.root.children.filter(node=>node.tag==='section');
 assert.equal(rows.length,9);
 assert.equal(rows[8].style.color,'red');
 for(const row of rows) {
  const details=row.children.find(node=>node.tag==='details');
  assert(details); assert(!details.open);
  assert.equal(details.children[0].tag,'summary');
  assert(!row.children.some(node=>node.textContent.startsWith('Correct answer:')));
 }
 quiz.listeners.languagechange({detail:{language:'de',labels:JSON.parse(fs.readFileSync('public/translations/de.json','utf8'))}});
 assert(quiz.texts().includes('8 richtig'));
 assert(quiz.texts().includes('Antworten anzeigen'));
});

test("all thirteen correct answers finish the quiz without showing a total",async()=>{
 const quiz=fixture({wrongAt:0}); await tick();
 for(let index=0;index<13;index++){quiz.click('C');quiz.click('Confirm');await tick();}
 assert.equal(quiz.calls.length,13); assert(quiz.texts().includes('13 correct'));
 assert(quiz.calls.every(call=>call.quiz_date==='2026-10-14'));
});

test("selection requires confirmation and retry does not resubmit completed answers",async()=>{
 const quiz=fixture({failAt:2,wrongAt:0});await tick();
 assert(!quiz.texts().includes('Back'));
 assert.throws(()=>quiz.click('Confirm'),/Disabled button/);
 quiz.click('A');quiz.click('C');
 assert.equal(quiz.calls.length,0);
 assert(quiz.texts().includes('Question 1'));
 quiz.click('Confirm');await tick();
 assert.equal(quiz.calls[0].answer.selected_index,2);
 assert.equal(quiz.calls.length,1);
 quiz.click('B');quiz.click('Confirm');await tick();quiz.click('Retry');await tick();
 assert.equal(quiz.calls.filter(call=>call.question_id===1).length,1);
 assert.equal(quiz.calls.filter(call=>call.question_id===2).length,2);
 assert(quiz.texts().includes('Question 3'));
});

test("incomplete daily quiz is unavailable without revealing the total",async()=>{
 const quiz=fixture({count:10});await tick();
 assert(quiz.texts().some(text=>text.includes('not available')));
 assert(!quiz.texts().some(text=>text.includes('13')));
});
