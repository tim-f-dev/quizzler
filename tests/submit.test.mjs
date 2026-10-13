import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const { default: worker } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);

function environment(question, insertError) {
  const inserts = [];
  return {
    inserts,
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              async first() {
                assert.match(sql, /SELECT type, answer/);
                assert.deepEqual(values, [1]);
                return question;
              },
              async run() {
                assert.match(sql, /INSERT INTO user_answers/);
                if (insertError) throw insertError;
                inserts.push(values);
              },
            };
          },
          async all() {
            assert.doesNotMatch(sql, /SELECT[^]*\banswer\b/);
            return { results: [{ id: 1 }] };
          },
        };
      },
    },
    ASSETS: { fetch: async () => new Response("static asset") },
  };
}

function submit(env, body) {
  return worker.fetch(new Request("https://quizzler.cc/api/submit", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }), env);
}

for (const [type, correct, good, wrong] of [
  ["multiple_choice", { correct_index: 2 }, { selected_index: 2 }, { selected_index: 0 }],
  ["true_false", { correct: true }, { selected: true }, { selected: false }],
  ["sorting", { correct_order: [1, 0, 2] }, { order: [1, 0, 2] }, { order: [0, 1, 2] }],
]) {
  test(type + ": grade and persist correct and incorrect answers", async () => {
    for (const [answer, isCorrect] of [[good, true], [wrong, false]]) {
      const env = environment({ type, answer: JSON.stringify(correct) });
      const response = await submit(env, { user_id: "player123", question_id: 1, answer });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        question_id: 1, is_correct: isCorrect, correct_answer: correct,
      });
      assert.equal(env.inserts.length, 1);
      assert.deepEqual(env.inserts[0].slice(0, 4),
        ["player123", 1, JSON.stringify(answer), isCorrect ? 1 : 0]);
      assert.equal(env.inserts[0][4], new Date().toISOString().slice(0, 10));
    }
  });
}

test("invalid requests do not write submissions", async () => {
  for (const body of ["{", null, {}, { user_id: "bad id", question_id: 1, answer: {} },
    { user_id: "player", question_id: -1, answer: {} },
    { user_id: "player", question_id: 1, answer: [] }]) {
    const env = environment(null);
    assert.equal((await submit(env, body)).status, 400);
    assert.equal(env.inserts.length, 0);
  }
});

test("missing and unsupported questions do not write", async () => {
  for (const [question, status] of [[null, 404],
    [{ type: "matching", answer: "{}" }, 400]]) {
    const env = environment(question);
    assert.equal((await submit(env, { user_id: "player", question_id: 1, answer: {} })).status, status);
    assert.equal(env.inserts.length, 0);
  }
});

test("duplicate and failed writes return errors without exposing answers", async () => {
  for (const [error, status] of [[new Error("UNIQUE constraint failed: user_answers"), 409],
    [new Error("database unavailable"), 500]]) {
    const env = environment({ type: "multiple_choice", answer: '{"correct_index":2}' }, error);
    const response = await submit(env, { user_id: "player", question_id: 1, answer: { selected_index: 2 } });
    assert.equal(response.status, status);
    assert.equal("correct_answer" in await response.json(), false);
  }
});

test("questions and static assets retain their existing routes", async () => {
  const env = environment(null);
  const questions = await worker.fetch(new Request("https://quizzler.cc/api/questions"), env);
  assert.deepEqual(await questions.json(), [{ id: 1 }]);
  const asset = await worker.fetch(new Request("https://quizzler.cc/about/"), env);
  assert.equal(await asset.text(), "static asset");
});
