
import { handleAdmin } from "./admin.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname).replace(/\/+/g, "/");
    if (/^\/admin(?:\/|\.|$)/.test(path) || /^\/api\/admin(?:\/|$)/.test(path)) {
      return handleAdmin(request, env, url);
    }

    if (url.pathname === "/api/questions") {
      const { results } = await env.DB
        .prepare(`
          SELECT id, type, question_en, question_de,
                 data, category, difficulty
          FROM questions
          LIMIT 10
        `)
        .all();

      return Response.json(results);
    }

    if (url.pathname === "/api/daily" && request.method === "GET") {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const date = url.searchParams.get("date") || today;

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date
        ) {
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

        const { results } = await env.DB
          .prepare(`
            SELECT q.id, q.type, q.question_en, q.question_de,
                   q.data, q.answer, q.category, q.difficulty, d.position
            FROM daily_questions d
            JOIN questions q ON q.id = d.question_id
            WHERE d.quiz_date = ?
            ORDER BY d.position
          `)
          .bind(date)
          .all();

        return Response.json({
          date,
          questions: results.map(q => ({ ...q, data: JSON.parse(q.data), answer: JSON.parse(q.answer) }))
        });
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
        // 1. Read submission
        const body = await request.json().catch(() => null);

        const { user_id, question_id, answer } = body ?? {};

        if (
          typeof user_id !== "string" ||
          !/^[a-zA-Z0-9_-]{1,100}$/.test(user_id) ||
          !Number.isSafeInteger(question_id) ||
          question_id <= 0 ||
          !answer ||
          typeof answer !== "object" ||
          Array.isArray(answer)
        ) {
          return Response.json(
            { error: "Invalid submission" },
            { status: 400 }
          );
        }

        const today = new Date().toISOString().slice(0, 10);
        const quizDate =
          typeof body.quiz_date === "string" ? body.quiz_date : today;

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(quizDate) ||
          Number.isNaN(Date.parse(quizDate)) ||
          new Date(quizDate).toISOString().slice(0, 10) !== quizDate ||
          quizDate > today
        ) {
          return Response.json(
            { error: "Invalid quiz date" },
            { status: 400 }
          );
        }

        // 2. Find the question and correct answer for this quiz date
        const question = await env.DB
          .prepare(`
            SELECT q.type, q.answer
            FROM questions q
            JOIN daily_questions d ON d.question_id = q.id
            WHERE q.id = ? AND d.quiz_date = ?
          `)
          .bind(question_id, quizDate)
          .first();

        if (!question) {
          return Response.json(
            { error: "Question not found in the requested quiz" },
            { status: 404 }
          );
        }

        const correctAnswer = JSON.parse(question.answer);

        // 3. Compare answers
        let isCorrect = false;

        switch (question.type) {
          case "multiple_choice":
            isCorrect =
              Number.isInteger(answer.selected_index) &&
              answer.selected_index === correctAnswer.correct_index;
            break;

          case "true_false":
            isCorrect =
              typeof answer.selected === "boolean" &&
              answer.selected === correctAnswer.correct;
            break;

          case "sorting":
            isCorrect =
              Array.isArray(answer.order) &&
              JSON.stringify(answer.order) ===
              JSON.stringify(correctAnswer.correct_order);
            break;

          default:
            return Response.json(
              { error: "Unsupported question type" },
              { status: 400 }
            );
        }

        // 4. Save the submission
        await env.DB
          .prepare(`
            INSERT INTO user_answers (
              user_id,
              question_id,
              answer,
              is_correct,
              quiz_date
            ) VALUES (?, ?, ?, ?, ?)
          `)
          .bind(
            user_id,
            question_id,
            JSON.stringify(answer),
            isCorrect ? 1 : 0,
            quizDate
          )
          .run();

        // 5. Acknowledge the saved answer
        return Response.json({
          question_id,
          saved: true
        });

      } catch (error) {
        console.error("Submit API error:", error);

        if (
          error.message?.includes("UNIQUE constraint failed")
        ) {
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
