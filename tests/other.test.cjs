const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function fixture(failure = false) {
  const button = { addEventListener(name, callback) { this[name] = callback; } };
  const status = {};
  const removed = [];
  let destination;
  vm.runInNewContext(fs.readFileSync("public/scripts/other.js", "utf8"), {
    document: { getElementById: id => id === "reset-daily" ? button : status, addEventListener() {} },
    window: { location: { pathname: "/de/other/", assign: value => { destination = value; } } },
    localStorage: { removeItem: key => removed.push(key) },
    fetch: async () => ({ ok: !failure, json: async () => ({ date: "2026-10-14" }) }),
    console: { error() {} },
  });
  return { button, status, removed, destination: () => destination };
}
test("reset clears the active quiz date and opens daily in the same language", async () => {
  const page = fixture();
  await page.button.click();
  assert.deepEqual(page.removed, ["quizzler-daily-attempt:2026-10-14"]);
  assert.equal(page.destination(), "/de/daily/");
});
test("API failure keeps saved attempts and allows retry", async () => {
  const page = fixture(true);
  await page.button.click();
  assert.deepEqual(page.removed, []);
  assert.equal(page.button.disabled, false);
  assert.equal(page.destination(), undefined);
});
