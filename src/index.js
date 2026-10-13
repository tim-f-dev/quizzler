
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    if (url.pathname === "/api/submit" && request.method === "POST") {
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

        // 2. Find the question and correct answer
        const question = await env.DB
          .prepare(`
            SELECT type, answer
            FROM questions
            WHERE id = ?
          `)
          .bind(question_id)
          .first();

        if (!question) {
          return Response.json(
            { error: "Question not found" },
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
        const quizDate = new Date().toISOString().slice(0, 10);

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

        // 5. Return result
        return Response.json({
          question_id,
          is_correct: isCorrect,
          correct_answer: correctAnswer
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
