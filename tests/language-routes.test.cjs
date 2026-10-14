const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const dataURL = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const worker = import(dataURL(fs.readFileSync("src/index.js", "utf8")
  .replace('"./admin.js"', JSON.stringify(dataURL(fs.readFileSync("src/admin.js", "utf8"))))
  .replace('"./localized-pages.js"', JSON.stringify(dataURL(fs.readFileSync("src/localized-pages.js", "utf8"))))))
  .then(module => module.default);

test("language-prefixed pages resolve to shared assets and old URLs redirect", async () => {
  const app = await worker;
  for (const lang of ["en", "de"]) {
    for (const page of ["", "daily/", "trivia/", "about/", "other/", "legal-notice/", "privacy-policy/"]) {
      let target;
      const response = await app.fetch(new Request("https://quizzler.cc/" + lang + "/" + page), {
        ASSETS: { fetch: async request => { target = new URL(request.url).pathname; return new Response("asset"); } },
      });
      assert.equal(response.status, 200);
      assert.equal(target, "/" + page);
    }
  }
  for (const [path, target] of [["/", "/en/"], ["/daily", "/en/daily"], ["/trivia/", "/en/trivia"], ["/de", "/de/"], ["/quiz", "/en/trivia"]]) {
    const response = await app.fetch(new Request("https://quizzler.cc" + path), {});
    assert.equal(response.status, 302);
    assert.equal(new URL(response.headers.get("Location")).pathname, target);
  }
});

test("explicit URL language wins over saved preference and switching keeps page/query", async () => {
  const labels = JSON.parse(fs.readFileSync("public/translations/de.json", "utf8"));
  const button = { addEventListener(name, callback) { this[name] = callback; } };
  const document = {
    currentScript: { src: "https://quizzler.cc/scripts/language.js" },
    getElementById: () => button,
    querySelectorAll: () => [],
    documentElement: {},
    body: { dataset: { page: "trivia" } },
    dispatchEvent() {},
  };
  let destination;
  const window = { location: {
    pathname: "/de/trivia/", href: "https://quizzler.cc/de/trivia/?foo=bar",
    assign(value) { destination = value; },
  } };
  vm.runInNewContext(fs.readFileSync("public/scripts/language.js", "utf8"), {
    document, window, URL, CustomEvent: class {},
    localStorage: { getItem: () => "en", setItem() {} },
    fetch: async url => { assert(url.pathname.endsWith("/de.json")); return { ok: true, json: async () => labels }; },
    console,
  });
  await new Promise(setImmediate);
  assert.equal(document.documentElement.lang, "de");
  button.click();
  assert.equal(destination, "https://quizzler.cc/en/trivia/?foo=bar");
});

test("random trivia API binds the requested category and language", async () => {
 const app=await worker;
 for(const language of ["en","de"]) for(const category of ["Geography","Entertainment","History","Arts & Literature","Science & Nature","Sports & Leisure"]) {
  const response=await app.fetch(new Request("https://quizzler.cc/api/trivia/random?"+new URLSearchParams({language,category})),{
   TRIVIA_DB:{prepare(sql){assert.match(sql,/ORDER BY RANDOM\(\)/);return {bind(...values){assert.deepEqual(values,[language,category]);return {first:async()=>({id:1,question:"Example",category,answer:"Answer"})};}};}}
  });
  assert.equal(response.status,200);assert.equal((await response.json()).question,"Example");
 }
 assert.equal((await app.fetch(new Request("https://quizzler.cc/api/trivia/random?language=fr&category=History"),{})).status,400);
 assert.equal((await app.fetch(new Request("https://quizzler.cc/api/trivia/random?category=invalid"),{})).status,400);
 const response=await app.fetch(new Request("https://quizzler.cc/api/trivia/random?language=en&category=History"),{TRIVIA_DB:{prepare:()=>({bind:()=>({first:async()=>null})})}});
 assert.equal(response.status,404);
});
