const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const dataURL = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const adminURL = dataURL(fs.readFileSync("src/admin.js", "utf8"));
const workerPromise = import(dataURL(fs.readFileSync("src/index.js", "utf8")
  .replace('"./admin.js"', JSON.stringify(adminURL)))).then(module => module.default);

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
      question_en TEXT NOT NULL, question_de TEXT NOT NULL,
      data TEXT NOT NULL, answer TEXT NOT NULL, category TEXT NOT NULL, difficulty INTEGER NOT NULL
    );
    CREATE TABLE daily_questions (
      quiz_date TEXT NOT NULL, question_id INTEGER REFERENCES questions(id), position INTEGER NOT NULL
    );
    CREATE TABLE user_answers (
      user_id TEXT, question_id INTEGER REFERENCES questions(id), answer TEXT, is_correct INTEGER, quiz_date TEXT
    );
  `);
  let batches = 0;
  const DB = {
    prepare(sql) {
      const stmt = {
        sql, values: [],
        bind(...values) { return { ...stmt, values }; },
        async all() { return { results: sqlite.prepare(sql).all(...this.values) }; },
        async first() { return sqlite.prepare(sql).get(...this.values) || null; },
      };
      return stmt;
    },
    async batch(statements) {
      batches++;
      sqlite.exec("BEGIN");
      try {
        for (const stmt of statements) sqlite.prepare(stmt.sql).run(...stmt.values);
        sqlite.exec("COMMIT");
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  const env = { ADMIN_IP: "94.31.114.255", DB, ASSETS: { fetch: async () => new Response("admin HTML") } };
  return { env, sqlite, batches: () => batches };
}

function request(path, method = "GET", body, extra = {}) {
  const req = new Request("https://quizzler.cc" + path, {
    method,
    headers: {
      "CF-Connecting-IP": "94.31.114.255",
      ...(method !== "GET" ? { Origin: "https://quizzler.cc", "Content-Type": "application/json", "X-Quizzler-Admin": "1" } : {}),
      ...extra,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  Object.defineProperty(req, "cf", { value: {} });
  return req;
}

const questions = () => Array.from({ length: 13 }, (_, index) => ({
  type: "multiple_choice", question_en: "Question " + index, question_de: "Frage " + index,
  data: { options_en: ["A", "B", "C", "D"], options_de: ["AA", "BB", "CC", "DD"] },
  answer: { correct_index: index % 4 }, category: "general", difficulty: 1,
}));

test("all admin HTML aliases and APIs deny wrong or missing IP before database/assets", async () => {
  const worker = await workerPromise;
  for (const path of ["/admin", "/admin/", "/admin/index.html", "/admin.html", "//admin/", "/%61dmin/", "/api/admin/days", "/api/admin/day?date=2026-10-14"]) {
    const env = { ADMIN_IP: "94.31.114.255" };
    for (const ip of ["203.0.113.1", ""]) {
      const response = await worker.fetch(request(path, "GET", undefined, {
        "CF-Connecting-IP": ip, "X-Forwarded-For": "94.31.114.255",
      }), env);
      assert.equal(response.status, 403, path);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
    }
    assert.equal((await worker.fetch(request(path), {})).status, 403);
  }
});

test("admin page allows configured IP, rejects Worker subrequests and normalizes IPv6", async () => {
  const worker = await workerPromise;
  const { env } = fixture();
  const response = await worker.fetch(request("/admin/"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await worker.fetch(request("/admin/", "GET", undefined, { "CF-Worker": "attacker.example" }), env)).status, 403);
  env.ADMIN_IP = "2001:db8::1";
  assert.equal((await worker.fetch(request("/admin/", "GET", undefined, { "CF-Connecting-IP": "2001:0db8:0:0:0:0:0:1" }), env)).status, 200);
});

test("create, list, read and edit a full day with isolated question rows", async () => {
  const worker = await workerPromise;
  const { env, sqlite, batches } = fixture();
  const endpoint = "/api/admin/day?date=2026-12-01";
  assert.equal((await worker.fetch(request(endpoint, "POST", { questions: questions() }), env)).status, 201);
  assert.equal(batches(), 1);
  const list = await worker.fetch(request("/api/admin/days"), env);
  assert.deepEqual(await list.json(), { days: ["2026-12-01"] });
  const read = await worker.fetch(request(endpoint), env);
  const day = await read.json();
  assert.equal(day.questions.length, 13);
  assert.deepEqual(day.questions.map(q => q.position), Array.from({ length: 13 }, (_, i) => i + 1));
  assert.deepEqual(day.questions[0].answer, { correct_index: 0 });
  sqlite.exec("INSERT INTO daily_questions SELECT '2026-12-02', question_id, position FROM daily_questions WHERE quiz_date='2026-12-01'");
  const updated = questions();
  updated[0].question_en = "Changed only this day";
  assert.equal((await worker.fetch(request(endpoint, "PUT", { questions: updated }), env)).status, 200);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM questions").get().count, 26);
  const unchanged = await worker.fetch(request("/api/admin/day?date=2026-12-02"), env);
  assert.equal((await unchanged.json()).questions[0].question_en, "Question 0");
  const changed = await worker.fetch(request(endpoint), env);
  assert.equal((await changed.json()).questions[0].question_en, "Changed only this day");
  assert.equal((await worker.fetch(request(endpoint, "POST", { questions: questions() }), env)).status, 409);
});

test("invalid input and cross-origin writes are rejected without mutations", async () => {
  const worker = await workerPromise;
  const { env, sqlite, batches } = fixture();
  const endpoint = "/api/admin/day?date=2026-12-01";
  assert.equal((await worker.fetch(request(endpoint, "POST", { questions: questions() }, { Origin: "https://evil.example" }), env)).status, 403);
  assert.equal((await worker.fetch(request(endpoint, "POST", { questions: questions() }, { "X-Quizzler-Admin": "" }), env)).status, 403);
  assert.equal((await worker.fetch(request(endpoint, "POST", { questions: questions().slice(1) }), env)).status, 400);
  const invalid = questions(); invalid[0].answer.correct_index = 4;
  assert.equal((await worker.fetch(request(endpoint, "POST", { questions: invalid }), env)).status, 400);
  assert.equal((await worker.fetch(request("/api/admin/day?date=2026-02-30"), env)).status, 400);
  assert.equal((await worker.fetch(request(endpoint, "PUT", { questions: questions() }), env)).status, 404);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM questions").get().count, 0);
  assert.equal(batches(), 0);
});

test("a failed batch rolls back both questions and daily mappings", async () => {
  const worker = await workerPromise;
  const { env, sqlite } = fixture();
  sqlite.exec("CREATE TRIGGER reject_third BEFORE INSERT ON daily_questions WHEN NEW.position=3 BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  const response = await worker.fetch(request("/api/admin/day?date=2026-12-01", "POST", { questions: questions() }), env);
  assert.equal(response.status, 500);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM questions").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM daily_questions").get().count, 0);
});
