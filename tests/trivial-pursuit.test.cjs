const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
class Element {
  children = []; style = {setProperty(name,value){this[name]=value;}}; hidden = false;
  classList = {values:new Set(),add(value){this.values.add(value);},remove(value){this.values.delete(value);},contains(value){return this.values.has(value);}};
  setAttribute(name,value){this[name]=value;}
  removeAttribute(name){delete this[name];}
  focus(){this.focused=true;}
  addEventListener(name, fn) { this[name] = fn; }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
}
function fixture(statusCode = 200) {
  const ids = Object.fromEntries(["trivia-intro","trivia-start","trivia-categories","trivia-status","trivia-question","trivia-question-text","trivia-title","trivia-card-scene","trivia-card","trivia-card-back","trivia-answer","trivia-continue"].map(key=>[key,new Element()]));
  ids["trivia-categories"].hidden=true;
  ids["trivia-card-scene"].hidden=true;
  let requested;
  const listeners={};
  vm.runInNewContext(fs.readFileSync("public/scripts/trivial-pursuit.js","utf8"), {
    document:{documentElement:{lang:"de"},querySelectorAll:()=>[],getElementById:id=>ids[id],createElement:()=>new Element(),addEventListener:(name,fn)=>{listeners[name]=fn;}},
    URLSearchParams, console,
    fetch:async url=>{requested=new URL(url,"https://quizzler.cc");return {ok:statusCode===200,status:statusCode,json:async()=>({question:"Beispielfrage?",answer:"Hidden answer"})};},
  });
  listeners.languagechange({detail:{language:"de",labels:JSON.parse(fs.readFileSync("public/translations/de.json","utf8"))}});
  return {ids,request:()=>requested};
}
test("start shows six colored categories and category fetch shows only the question",async()=>{
 const {ids,request}=fixture();
 assert(ids["trivia-categories"].hidden);
 ids["trivia-start"].click();
 assert(ids["trivia-intro"].hidden);
 assert(ids["trivia-start"].hidden);assert(!ids["trivia-categories"].hidden);
 const buttons=ids["trivia-categories"].children;
 assert.equal(buttons.length,6);
 assert.deepEqual(buttons.map(button=>button.style.color),["blue","red","gold","purple","green","teal"].map(color=>"var(--color-"+color+")"));
 buttons[3].click();await new Promise(setImmediate);
 assert.equal(request().pathname,"/api/trivia/random");
 assert.equal(request().searchParams.get("language"),"de");
 assert.equal(request().searchParams.get("category"),"arts");
 assert.equal(ids["trivia-question-text"].textContent,"Beispielfrage?");
 assert(!ids["trivia-card-scene"].hidden);
 assert(ids["trivia-categories"].hidden);
 assert.equal(ids["trivia-title"].textContent,"Kunst & Literatur");
 assert.equal(ids["trivia-card-scene"].style['--category-color'],'var(--color-purple)');
 assert(ids['trivia-card-back'].inert);
 ids['trivia-question'].click();
 assert(ids['trivia-card'].classList.contains('is-flipped'));
 assert(!ids['trivia-card-back'].inert);
 assert.equal(ids['trivia-answer'].textContent,'Hidden answer');
 ids['trivia-continue'].click();
 assert(ids['trivia-card-scene'].hidden);
 assert(!ids['trivia-categories'].hidden);
 assert.equal(ids['trivia-title'].textContent,'Trivial Pursuit');
});
test("empty category presents a translated message without a question",async()=>{
 const {ids}=fixture(404);ids["trivia-start"].click();
 ids["trivia-categories"].children[0].click();await new Promise(setImmediate);
 assert(ids["trivia-card-scene"].hidden);
 assert.equal(ids["trivia-status"].textContent,"Für diese Kategorie ist keine Frage verfügbar.");
});
