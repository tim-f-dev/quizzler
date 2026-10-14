const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (data, status = 200) => Response.json(data, { status, headers });
const validDate = date => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;

function normalizeIP(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const ip = value.trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return ip.split(".").every(part => Number(part) <= 255) ? ip.split(".").map(Number).join(".") : null;
  }
  try {
    if (!/^[a-f\d:]+$/i.test(ip) || !ip.includes(":")) return null;
    return new URL("http://[" + ip + "]/").hostname.toLowerCase();
  } catch { return null; }
}

export function adminAllowed(request, env) {
  const allowed = normalizeIP(env.ADMIN_IP);
  // Cloudflare sets this header on incoming requests. Never trust forwarded-IP alternatives.
  return Boolean(allowed && request.cf && !request.headers.has("CF-Worker") &&
    normalizeIP(request.headers.get("CF-Connecting-IP")) === allowed);
}

export async function handleAdmin(request, env, url) {
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
      return json({ days: results.map(row => row.quiz_date) });
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
      return json({ date, questions: results.map(q => ({
        ...q, data: JSON.parse(q.data), answer: JSON.parse(q.answer),
      })) });
    }
    if (!["POST", "PUT"].includes(request.method)) return json({ error: "Method not allowed" }, 405);
    // A same-origin custom header prevents cross-site forms from changing quiz data.
    if (request.headers.get("Origin") !== url.origin ||
        request.headers.get("X-Quizzler-Admin") !== "1" ||
        !request.headers.get("Content-Type")?.startsWith("application/json")) {
      return json({ error: "Invalid request origin or headers" }, 403);
    }
    const raw = await request.text();
    if (raw.length > 65536) return json({ error: "Request too large" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
    const questions = body?.questions;
    const nonempty = value => typeof value === "string" && value.trim().length > 0 && value.length <= 2000;
    if (!Array.isArray(questions) || questions.length !== 13 ||
        !questions.every(q => q && q.type === "multiple_choice" &&
          nonempty(q.question_en) && nonempty(q.question_de) &&
          ["options_en", "options_de"].every(key => Array.isArray(q.data?.[key]) &&
            q.data[key].length === 4 && q.data[key].every(nonempty)) &&
          Number.isInteger(q.answer?.correct_index) && q.answer.correct_index >= 0 && q.answer.correct_index < 4 &&
          nonempty(q.category) && Number.isSafeInteger(q.difficulty) && q.difficulty >= 0)) {
      return json({ error: "Provide 13 complete multiple-choice questions, four options per language, a correct index (0–3), category and nonnegative difficulty." }, 400);
    }
    const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM daily_questions WHERE quiz_date = ?").bind(date).first();
    if (request.method === "POST" && existing.count > 0) return json({ error: "Day already exists" }, 409);
    if (request.method === "PUT" && existing.count !== 13) return json({ error: "Day not implemented" }, 404);
    const statements = [
      env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS admin_daily_date_position ON daily_questions (quiz_date, position)"),
    ];
    if (request.method === "PUT") statements.push(env.DB.prepare("DELETE FROM daily_questions WHERE quiz_date = ?").bind(date));
    // New question rows isolate edits to this date and retain old submitted-answer references.
    questions.forEach((q, index) => {
      statements.push(env.DB.prepare(`
        INSERT INTO questions (type, question_en, question_de, data, answer, category, difficulty)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(q.type, q.question_en.trim(), q.question_de.trim(),
        JSON.stringify(q.data), JSON.stringify(q.answer), q.category.trim(), q.difficulty));
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
