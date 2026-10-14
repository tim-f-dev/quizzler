const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ""; }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(type, listener) { this[type] = listener; }
  style = {};
}

function fixture({ failAt, count = 13, wrongAt = 9, correctIndex = 0, navigator = {} } = {}) {
  const root = new Element("div");
  const speech = new Element("p");
  const window = { location: {} };
  vm.runInNewContext(fs.readFileSync("public/scripts/telephone-joker.js", "utf8"), { window });
  const listeners = {};
  const calls = [];
  let failed = false;
  const questions = Array.from({ length: count }, (_, index) => ({
    id: index + 1, type: "multiple_choice", question_en: "Question " + index,
    question_de: "Frage " + index,
    answer: {correct_index: index + 1 === wrongAt ? 2 : correctIndex},
    data: { options_en: ["A", "B", "C", "D"], options_de: ["AA", "BB", "CC", "DD"] },
  }));
  vm.runInNewContext(fs.readFileSync("public/scripts/daily.js", "utf8"), {
    document: {
      getElementById: id => id === "telephone-speech" ? speech : root, createElement: tag => new Element(tag),
      createElementNS: (namespace, tag) => new Element(tag),
      documentElement: { lang: "en" },
      addEventListener: (name, listener) => { listeners[name] = listener; },
    },
    crypto: { randomUUID: () => "test-uuid" },
    Math: Object.assign(Object.create(Math), {random: () => 0.999}),
    window,
    navigator,
    console: { error() {} },
    fetch: async (url, options) => {
      if (url === "/api/daily") return { ok: true, json: async () => ({ date: "2026-10-14", questions }) };
      assert.equal(url, "/api/answers");
      const body = JSON.parse(options.body);
      calls.push(body);
      if (body.question_id === failAt && !failed) {
        failed = true;
        return { ok: false, status: 500 };
      }
      return { ok: true, json: async () => ({
        saved: true,
      }) };
    },
  });
  function nodes(node = root) { return [node, ...node.children.flatMap(nodes)]; }
  return {
    calls, root, listeners, speech,
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

test("joker first press selects and second press activates", async () => {
 const quiz=fixture({correctIndex:2,wrongAt:0});await tick();
 quiz.click('50/50');
 let jokers=quiz.root.children.find(node=>node.className==='joker-buttons');
 assert.equal(jokers.children[0]['aria-pressed'],'true');
 let choices=quiz.root.children.find(node=>node.className==='answer-choices');
 assert.equal(choices.children.filter(node=>node.disabled).length,0);
 quiz.click('phone');
 assert(quiz.speech.hidden);
 quiz.click('phone');
 assert(!quiz.speech.hidden);
 quiz.click('50/50');quiz.click('50/50');
 choices=quiz.root.children.find(node=>node.className==='answer-choices');
 assert.equal(choices.children.filter(node=>node.disabled).length,2);
});

test("Copy Result copies text without opening native sharing", async () => {
 let copied;
 const quiz=fixture({wrongAt:1,navigator:{
  share:async()=>assert.fail('Copy must not open sharing'),
  clipboard:{writeText:async value=>{copied=value;}}
 }});
 await tick();quiz.click('A');quiz.click('Confirm');await tick();
 const actions=quiz.root.children.find(node=>node.className==='result-actions');
 assert.deepEqual(actions.children.map(node=>node.textContent),['Share','Copy Result']);
 quiz.click('Copy Result');await tick();
 assert(copied.includes('🏆 Level 0/13: 🧱 Brick'));
 assert(quiz.texts().includes('Copied!'));
});

test("share copies the actual result in the requested format", async () => {
 let copied;
 const quiz=fixture({wrongAt:10,navigator:{clipboard:{writeText:async value=>{copied=value;}}}});
 await tick();
 for(let index=0;index<10;index++){quiz.click('A');quiz.click('Confirm');await tick();}
 quiz.click('Share');await tick();
 assert.equal(copied,"🧢Quizzler Daily\n🏆 Level 9/13: 💻 Wikipedia Editor\n🃏 Jokers left: 3\nThink you can beat me?\nhttps://quizzler.cc/daily");
 assert(quiz.texts().includes('Copied!'));
});

test("native share includes actual remaining jokers", async () => {
 let shared;
 const quiz=fixture({wrongAt:1,navigator:{share:async value=>{shared=value.text;}}});
 await tick();quiz.click('50/50');quiz.click('50/50');quiz.click('phone');quiz.click('phone');quiz.click('D');quiz.click('Confirm');await tick();
 quiz.click('Share');await tick();
 assert(shared.includes('🏆 Level 0/13: 🧱 Brick'));
 assert(shared.includes('🃏 Jokers left: 1'));
});

test("telephone response weights, correct and wrong hints, bilingual formatting", () => {
 const window = {};
 vm.runInNewContext(fs.readFileSync("public/scripts/telephone-joker.js", "utf8"), { window });
 const joker=window.TelephoneJoker;
 assert.equal(joker.responses[0].weight,0.5);
 assert.equal(joker.responses[1].weight,0.5);
 const question={answer:{correct_index:2},data:{options_en:['A','B','C','D'],options_de:['AA','BB','CC','DD']}};
 const correct=joker.choose(question,()=>0.1);
 assert.equal(correct.answerIndex,2);
 assert.equal(joker.format(correct,question,'en'),"I think it's C");
 assert.equal(joker.format(correct,question,'de'),'Ich glaube, es ist CC');
 for(const draw of [0.51,0.75,0.99]) {
  const wrong=joker.choose(question,()=>draw);
  assert.notEqual(wrong.answerIndex,2);
  assert(joker.format(wrong,question,'en').startsWith("I don't think it's "));
 }
});

test("telephone displays a single-use hint and hides it on the next question", async () => {
 const quiz=fixture({wrongAt:0,correctIndex:2});await tick();
 assert(quiz.speech.hidden);
 quiz.click('phone');quiz.click('phone');
 assert(!quiz.speech.hidden);
 assert(quiz.speech.textContent.length>0);
 assert.throws(()=>quiz.click('phone'),/Disabled button/);
 quiz.click('C');quiz.click('Confirm');await tick();
 assert(quiz.speech.hidden);
 assert.throws(()=>quiz.click('phone'),/Disabled button/);
});

test("50/50 disables two answers, clears eliminated selection and is used once", async () => {
 const quiz=fixture({wrongAt:0,correctIndex:2}); await tick();
 quiz.click('A'); quiz.click('50/50');quiz.click('50/50'); await tick();
 assert.throws(()=>quiz.click('A'),/Disabled button/);
 assert.throws(()=>quiz.click('B'),/Disabled button/);
 assert.throws(()=>quiz.click('Confirm'),/Disabled button/);
 assert.throws(()=>quiz.click('50/50'),/Disabled button/);
 const choices=quiz.root.children.find(node=>node.className==='answer-choices');
 assert.equal(choices.children.filter(node=>node.className==='eliminated-answer').length,2);
 quiz.click('C'); quiz.click('Confirm'); await tick();
 assert.throws(()=>quiz.click('50/50'),/Disabled button/);
 quiz.click('A');
});

test("first wrong answer ends the quiz with one collapsed review accordion", async () => {
 const quiz=fixture(); await tick();
 for(let index=1;index<=9;index++) {
  assert(quiz.texts().includes('Question '+index));
  assert(!quiz.texts().some(text=>text.includes('/13')));
  quiz.click('A'); quiz.click('Confirm'); await tick();
 }
 assert.equal(quiz.calls.length,9);
 assert(quiz.texts().includes('8 correct'));
 assert(quiz.texts().includes('Level reached: 🎮 Twitch Moderator'));
 const accordions=quiz.root.children.filter(node=>node.tag==='details');
 assert.equal(accordions.length,1);
 const details=accordions[0];
 assert(!details.open);
 assert.equal(details.children[0].tag,'summary');
 assert.equal(quiz.root.children.filter(node=>node.tag==='section').length,0);
 const rows=details.children.filter(node=>node.tag==='section');
 assert.equal(rows.length,9);
 assert.equal(rows[8].style.color,'red');
 for(const row of rows) {
  assert(!row.children.some(node=>node.tag==='details'));
  assert(row.children.some(node=>node.textContent.startsWith('Correct answer:')));
 }
 quiz.listeners.languagechange({detail:{language:'de',labels:JSON.parse(fs.readFileSync('public/translations/de.json','utf8'))}});
 assert(quiz.texts().includes('8 richtig'));
 assert(quiz.texts().includes('Antworten anzeigen'));
});

test("all thirteen correct answers finish the quiz without showing a total",async()=>{
 const quiz=fixture({wrongAt:0,correctIndex:2}); await tick();
 for(let index=0;index<13;index++){quiz.click('C');quiz.click('Confirm');await tick();}
 assert.equal(quiz.calls.length,13); assert(quiz.texts().includes('13 correct'));
 assert(quiz.texts().includes('Level reached: 🌌 Galaxy Brain'));
 assert(quiz.calls.every(call=>call.quiz_date==='2026-10-14'));
});

test("selection requires confirmation and retry does not resubmit completed answers",async()=>{
 const quiz=fixture({failAt:2,wrongAt:0,correctIndex:2});await tick();
 assert(!quiz.texts().includes('Back'));
 assert.throws(()=>quiz.click('Confirm'),/Disabled button/);
 quiz.click('A');quiz.click('C');
 assert.equal(quiz.calls.length,0);
 assert(quiz.texts().includes('Question 1'));
 quiz.click('Confirm');await tick();
 assert.equal(quiz.calls[0].answer.selected_index,2);
 assert.equal(quiz.calls.length,1);
 quiz.click('C');quiz.click('Confirm');await tick();quiz.click('Retry');await tick();
 assert.equal(quiz.calls.filter(call=>call.question_id===1).length,1);
 assert.equal(quiz.calls.filter(call=>call.question_id===2).length,2);
 assert(quiz.texts().includes('Question 3'));
});

test("incomplete daily quiz is unavailable without revealing the total",async()=>{
 const quiz=fixture({count:10});await tick();
 assert(quiz.texts().some(text=>text.includes('not available')));
 assert(!quiz.texts().some(text=>text.includes('13')));
});

test("first question targets level one and first failure earns level zero", async () => {
 const quiz=fixture({wrongAt:1});await tick();
 assert(quiz.texts().includes('🦠 Single Brain Cell'));
 quiz.click('A');quiz.click('Confirm');await tick();
 assert(quiz.texts().includes('Level reached: 🧱 Brick'));
 assert(quiz.texts().includes('0 correct'));
 assert(quiz.texts().includes('Jokers left: 3'));
});

test("results count used 50/50 and phone jokers", async () => {
 const quiz=fixture({wrongAt:1});await tick();
 quiz.click('50/50');quiz.click('50/50');quiz.click('phone');quiz.click('phone');quiz.click('D');quiz.click('Confirm');await tick();
 assert(quiz.texts().includes('Jokers left: 1'));
});
