
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

    return env.ASSETS.fetch(request);
  }
};
