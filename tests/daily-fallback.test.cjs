const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const moduleURL = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const worker = import(moduleURL(fs.readFileSync("src/index.js", "utf8")
  .replace('"./admin.js"', JSON.stringify(moduleURL(fs.readFileSync("src/admin.js", "utf8"))))
  .replace('"./localized-pages.js"', JSON.stringify(moduleURL(fs.readFileSync("src/localized-pages.js", "utf8"))))))
  .then(module => module.default);
const today = new Date().toISOString().slice(0, 10);
function offset(days) {
  return new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE questions(id INTEGER PRIMARY KEY,type TEXT,question_en TEXT,question_de TEXT,
      data TEXT,answer TEXT,category TEXT,difficulty INTEGER);
    CREATE TABLE daily_questions(quiz_date TEXT,question_id INTEGER,position INTEGER);
  `);
  const env = { DB: { prepare(sql) {
    return { bind(...values) { return {
      first: async () => db.prepare(sql).get(...values) || null,
      all: async () => ({ results: db.prepare(sql).all(...values) }),
    }; } };
  } } };
  function addDay(date, count = 13) {
    for (let position = 1; position <= count; position++) {
      const id = Number(db.prepare("INSERT INTO questions VALUES(NULL,?,?,?,?,?,?,?)")
        .run("multiple_choice","Question","Frage",'{"options_en":["A","B","C","D"]}',
          '{"correct_index":0}',"general",1).lastInsertRowid);
      db.prepare("INSERT INTO daily_questions VALUES(?,?,?)").run(date,id,position);
    }
  }
  return { env, addDay };
}
test("today falls back to the latest complete past quiz and returns its actual date", async () => {
  const app=await worker;
  const {env,addDay}=fixture();
  addDay(offset(-5));addDay(offset(-2));addDay(offset(-1),12);addDay(offset(1));
  const response=await app.fetch(new Request("https://quizzler.cc/api/daily"),env);
  const quiz=await response.json();
  assert.equal(quiz.date,offset(-2));
  assert.equal(quiz.questions.length,13);
  assert.equal(response.headers.get("Cache-Control"),"no-store");
  assert.deepEqual(quiz.questions.map(q=>q.position),Array.from({length:13},(_,i)=>i+1));
});
test("a complete current quiz wins over older quizzes", async () => {
  const app=await worker;const {env,addDay}=fixture();
  addDay(offset(-1));addDay(today);
  const response=await app.fetch(new Request("https://quizzler.cc/api/daily"),env);
  assert.equal((await response.json()).date,today);
});
test("historical requests stay exact and an empty database stays empty", async () => {
  const app=await worker;const {env,addDay}=fixture();
  let response=await app.fetch(new Request("https://quizzler.cc/api/daily"),env);
  assert.deepEqual(await response.json(),{date:today,questions:[]});
  addDay(offset(-5));
  response=await app.fetch(new Request("https://quizzler.cc/api/daily?date="+offset(-2)),env);
  assert.deepEqual(await response.json(),{date:offset(-2),questions:[]});
  assert.equal((await app.fetch(new Request("https://quizzler.cc/api/daily?date="+offset(1)),env)).status,403);
});
