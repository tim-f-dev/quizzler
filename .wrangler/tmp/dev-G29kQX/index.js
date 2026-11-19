var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/admin.js
var headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
var json = /* @__PURE__ */ __name((data, status = 200) => Response.json(data, { status, headers }), "json");
var validDate = /* @__PURE__ */ __name((date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date, "validDate");
function normalizeIP(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const ip = value.trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return ip.split(".").every((part) => Number(part) <= 255) ? ip.split(".").map(Number).join(".") : null;
  }
  try {
    if (!/^[a-f\d:]+$/i.test(ip) || !ip.includes(":")) return null;
    return new URL("http://[" + ip + "]/").hostname.toLowerCase();
  } catch {
    return null;
  }
}
__name(normalizeIP, "normalizeIP");
function adminAllowed(request, env) {
  const allowed = normalizeIP(env.ADMIN_IP);
  return Boolean(allowed && request.cf && !request.headers.has("CF-Worker") && normalizeIP(request.headers.get("CF-Connecting-IP")) === allowed);
}
__name(adminAllowed, "adminAllowed");
async function handleAdmin(request, env, url) {
  if (!adminAllowed(request, env)) return json({ error: "Forbidden" }, 403);
  if (!url.pathname.startsWith("/api/admin")) {
    const response = await env.ASSETS.fetch(request);
    const safe = new Response(response.body, response);
    for (const [key, value] of Object.entries(headers)) safe.headers.set(key, value);
    return safe;
  }
  try {
    if (url.pathname === "/api/admin/days" && request.method === "GET") {
      const { results } = await env.DB.prepare(`
        SELECT d.quiz_date FROM daily_questions d JOIN questions q ON q.id = d.question_id
        GROUP BY d.quiz_date HAVING COUNT(*) = 13 ORDER BY d.quiz_date DESC
      `).all();
      return json({ days: results.map((row) => row.quiz_date) });
    }
    if (url.pathname !== "/api/admin/day") return json({ error: "Not found" }, 404);
    const date = url.searchParams.get("date");
    if (!validDate(date)) return json({ error: "Invalid date. Use YYYY-MM-DD." }, 400);
    if (request.method === "GET") {
      const { results } = await env.DB.prepare(`
        SELECT q.id, q.type, q.question_en, q.question_de, q.data, q.answer,
               q.category, q.difficulty, d.position
        FROM daily_questions d JOIN questions q ON q.id = d.question_id
        WHERE d.quiz_date = ? ORDER BY d.position
      `).bind(date).all();
      if (results.length !== 13) return json({ error: "Day not implemented" }, 404);
      return json({ date, questions: results.map((q) => ({
        ...q,
        data: JSON.parse(q.data),
        answer: JSON.parse(q.answer)
      })) });
    }
    if (!["POST", "PUT"].includes(request.method)) return json({ error: "Method not allowed" }, 405);
    if (request.headers.get("Origin") !== url.origin || request.headers.get("X-Quizzler-Admin") !== "1" || !request.headers.get("Content-Type")?.startsWith("application/json")) {
      return json({ error: "Invalid request origin or headers" }, 403);
    }
    const raw = await request.text();
    if (raw.length > 65536) return json({ error: "Request too large" }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const questions = body?.questions;
    const nonempty = /* @__PURE__ */ __name((value) => typeof value === "string" && value.trim().length > 0 && value.length <= 2e3, "nonempty");
    if (!Array.isArray(questions) || questions.length !== 13 || !questions.every((q) => q && q.type === "multiple_choice" && nonempty(q.question_en) && nonempty(q.question_de) && ["options_en", "options_de"].every((key) => Array.isArray(q.data?.[key]) && q.data[key].length === 4 && q.data[key].every(nonempty)) && Number.isInteger(q.answer?.correct_index) && q.answer.correct_index >= 0 && q.answer.correct_index < 4 && nonempty(q.category) && Number.isSafeInteger(q.difficulty) && q.difficulty >= 0)) {
      return json({ error: "Provide 13 complete multiple-choice questions, four options per language, a correct index (0\u20133), category and nonnegative difficulty." }, 400);
    }
    const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM daily_questions WHERE quiz_date = ?").bind(date).first();
    if (request.method === "POST" && existing.count > 0) return json({ error: "Day already exists" }, 409);
    if (request.method === "PUT" && existing.count !== 13) return json({ error: "Day not implemented" }, 404);
    const statements = [
      env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS admin_daily_date_position ON daily_questions (quiz_date, position)")
    ];
    if (request.method === "PUT") statements.push(env.DB.prepare("DELETE FROM daily_questions WHERE quiz_date = ?").bind(date));
    questions.forEach((q, index) => {
      statements.push(env.DB.prepare(`
        INSERT INTO questions (type, question_en, question_de, data, answer, category, difficulty)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        q.type,
        q.question_en.trim(),
        q.question_de.trim(),
        JSON.stringify(q.data),
        JSON.stringify(q.answer),
        q.category.trim(),
        q.difficulty
      ));
      statements.push(env.DB.prepare(`
        INSERT INTO daily_questions (quiz_date, question_id, position) VALUES (?, last_insert_rowid(), ?)
      `).bind(date, index + 1));
    });
    await env.DB.batch(statements);
    return json({ saved: true, date }, request.method === "POST" ? 201 : 200);
  } catch (error) {
    console.error("Admin API error:", error);
    if (String(error?.message).includes("UNIQUE constraint")) return json({ error: "Day changed or already exists; reload and try again." }, 409);
    return json({ error: "Admin operation failed" }, 500);
  }
}
__name(handleAdmin, "handleAdmin");

// src/localized-pages.js
async function localizedPage(response, env, language, pagePath) {
  if (response.status >= 300 && response.status < 400) {
    const redirected = new Response(response.body, response);
    const location = redirected.headers.get("Location");
    if (location?.startsWith("/") && !/^\/(en|de)(\/|$)/.test(location)) {
      redirected.headers.set("Location", "/" + language + location);
    }
    return redirected;
  }
  if (!response.headers.get("Content-Type")?.includes("text/html")) return response;
  const translation = await env.ASSETS.fetch(new Request("https://assets.local/translations/" + language + ".json"));
  const labels = await translation.json();
  const canonical = new URL("/" + language + pagePath, "https://quizzler.cc").href;
  const page = pagePath.includes("/trivia/trivial-pursuit") ? "trivialPursuit" : pagePath.split("/").filter(Boolean)[0];
  const title = page === "daily" ? '"Quizzler Daily" - Daily trivia game' : labels[page] ? labels[page] + " | Quizzler" : null;
  return new HTMLRewriter().on("html", { element(el) {
    el.setAttribute("lang", language);
  } }).on("title", { element(el) {
    if (title) el.setInnerContent(title);
  } }).on('link[rel="canonical"]', { element(el) {
    el.setAttribute("href", canonical);
  } }).on('meta[property="og:url"]', { element(el) {
    el.setAttribute("content", canonical);
  } }).on("head", { element(el) {
    for (const lang of ["en", "de"]) {
      const href = new URL("/" + lang + pagePath, "https://quizzler.cc").href.replace(/&/g, "&amp;");
      el.append('<link rel="alternate" hreflang="' + lang + '" href="' + href + '">', { html: true });
    }
  } }).transform(response);
}
__name(localizedPage, "localizedPage");

// src/index.js
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname).replace(/\/+/g, "/");
    const localized = path.match(/^\/(en|de)(\/.*)?$/);
    if (localized) {
      const language = localized[1];
      if (!localized[2]) {
        url.pathname = "/" + language + "/";
        return Response.redirect(url.toString(), 302);
      }
      const pagePath = localized[2];
      if (/^\/quiz(?:\/|\/index\.html)?$/.test(pagePath)) {
        url.pathname = "/" + language + "/trivia/";
        return Response.redirect(url.toString(), 302);
      }
      const assetURL = new URL(request.url);
      assetURL.pathname = pagePath;
      const assetRequest = new Request(assetURL, request);
      if (request.cf && !assetRequest.cf) Object.defineProperty(assetRequest, "cf", { value: request.cf });
      const response = /^\/admin(?:\/|\.|$)/.test(pagePath) ? await handleAdmin(assetRequest, env, assetURL) : await env.ASSETS.fetch(assetRequest);
      return localizedPage(response, env, language, pagePath);
    }
    if (/^\/admin(?:\/|\.|$)/.test(path) || /^\/api\/admin(?:\/|$)/.test(path)) {
      const response = await handleAdmin(request, env, url);
      if (!path.startsWith("/api/") && response.ok) {
        url.pathname = "/en" + path;
        return Response.redirect(url.toString(), 302);
      }
      return response;
    }
    const aliases = { quiz: "trivia", impressum: "legal-notice", datenschutz: "privacy-policy" };
    const page = path.replace(/^\//, "").replace(/\/(?:index.html)?$/, "");
    if (/^\/trivia\/trivial(?:-| )pursuit(?:\/|\/index.html)?$/.test(path)) {
      url.pathname = "/en/trivia/trivial-pursuit/";
      return Response.redirect(url.toString(), 302);
    }
    if (path === "/" || path === "/index.html" || aliases[page] || ["daily", "trivia", "about", "other", "legal-notice", "privacy-policy", "daily/index.html", "trivia/index.html", "about/index.html", "other/index.html", "legal-notice/index.html", "privacy-policy/index.html"].includes(page)) {
      url.pathname = "/en/" + (aliases[page] || (page === "index.html" ? "" : page));
      return Response.redirect(url.toString(), 302);
    }
    if (url.pathname === "/api/trivia/random" && request.method === "GET") {
      const language = url.searchParams.get("language") || "en";
      const category = url.searchParams.get("category");
      const categories = ["geography", "entertainment", "history", "arts", "science", "sports"];
      if (!["en", "de"].includes(language) || !categories.includes(category)) {
        return Response.json({ error: "Invalid language or category" }, { status: 400 });
      }
      try {
        const question = await env.TRIVIA_DB.prepare(`
          SELECT id, question, category, difficulty, answer
          FROM questions
          WHERE language = ? AND category = ?
          ORDER BY RANDOM()
          LIMIT 1
        `).bind(language, category).first();
        if (!question) return Response.json({ error: "No question available" }, { status: 404 });
        return Response.json(question, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        console.error("Trivia API error:", error);
        return Response.json({ error: "Failed to load trivia question" }, { status: 500 });
      }
    }
    if (url.pathname === "/api/questions") {
      const { results } = await env.DB.prepare(`
          SELECT id, type, question_en, question_de,
                 data, category, difficulty
          FROM questions
          LIMIT 10
        `).all();
      return Response.json(results);
    }
    if (url.pathname === "/api/daily" && request.method === "GET") {
      try {
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const date = url.searchParams.get("date") || today;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
          return Response.json(
            { error: "Invalid date. Use YYYY-MM-DD." },
            { status: 400 }
          );
        }
        if (date > today) {
          return Response.json(
            { error: "Future quizzes are not available" },
            { status: 403 }
          );
        }
        let quizDate = date;
        if (date === today) {
          const latest = await env.DB.prepare(`
            SELECT d.quiz_date
            FROM daily_questions d
            JOIN questions q ON q.id = d.question_id
            WHERE d.quiz_date <= ?
            GROUP BY d.quiz_date
            HAVING COUNT(*) = 13
            ORDER BY d.quiz_date DESC
            LIMIT 1
          `).bind(today).first();
          if (latest) quizDate = latest.quiz_date;
        }
        const { results } = await env.DB.prepare(`
            SELECT q.id, q.type, q.question_en, q.question_de,
                   q.data, q.answer, q.category, q.difficulty, d.position
            FROM daily_questions d
            JOIN questions q ON q.id = d.question_id
            WHERE d.quiz_date = ?
            ORDER BY d.position
          `).bind(quizDate).all();
        return Response.json({
          date: quizDate,
          questions: results.map((q) => ({ ...q, data: JSON.parse(q.data), answer: JSON.parse(q.answer) }))
        }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        console.error("Daily quiz error:", error);
        return Response.json(
          { error: "Failed to load daily quiz" },
          { status: 500 }
        );
      }
    }
    if (url.pathname === "/api/answers" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => null);
        const { user_id, question_id, answer } = body ?? {};
        if (typeof user_id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(user_id) || !Number.isSafeInteger(question_id) || question_id <= 0 || !answer || typeof answer !== "object" || Array.isArray(answer)) {
          return Response.json(
            { error: "Invalid submission" },
            { status: 400 }
          );
        }
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const quizDate = typeof body.quiz_date === "string" ? body.quiz_date : today;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(quizDate) || Number.isNaN(Date.parse(quizDate)) || new Date(quizDate).toISOString().slice(0, 10) !== quizDate || quizDate > today) {
          return Response.json(
            { error: "Invalid quiz date" },
            { status: 400 }
          );
        }
        const question = await env.DB.prepare(`
            SELECT q.type, q.answer
            FROM questions q
            JOIN daily_questions d ON d.question_id = q.id
            WHERE q.id = ? AND d.quiz_date = ?
          `).bind(question_id, quizDate).first();
        if (!question) {
          return Response.json(
            { error: "Question not found in the requested quiz" },
            { status: 404 }
          );
        }
        const correctAnswer = JSON.parse(question.answer);
        let isCorrect = false;
        switch (question.type) {
          case "multiple_choice":
            isCorrect = Number.isInteger(answer.selected_index) && answer.selected_index === correctAnswer.correct_index;
            break;
          case "true_false":
            isCorrect = typeof answer.selected === "boolean" && answer.selected === correctAnswer.correct;
            break;
          case "sorting":
            isCorrect = Array.isArray(answer.order) && JSON.stringify(answer.order) === JSON.stringify(correctAnswer.correct_order);
            break;
          default:
            return Response.json(
              { error: "Unsupported question type" },
              { status: 400 }
            );
        }
        await env.DB.prepare(`
            INSERT INTO user_answers (
              user_id,
              question_id,
              answer,
              is_correct,
              quiz_date
            ) VALUES (?, ?, ?, ?, ?)
          `).bind(
          user_id,
          question_id,
          JSON.stringify(answer),
          isCorrect ? 1 : 0,
          quizDate
        ).run();
        return Response.json({
          question_id,
          saved: true
        });
      } catch (error) {
        console.error("Submit API error:", error);
        if (error.message?.includes("UNIQUE constraint failed")) {
          return Response.json(
            { error: "Question already answered" },
            { status: 409 }
          );
        }
        return Response.json(
          { error: "Failed to submit answer" },
          { status: 500 }
        );
      }
    }
    return env.ASSETS.fetch(request);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers2 = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers2["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers: headers2 });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-g0fLtH/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-g0fLtH/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
