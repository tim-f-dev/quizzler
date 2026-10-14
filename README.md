# quizzler

Static site assets live in `public/`. The Worker entry point is
`src/index.js`, configured in `wrangler.json`.

Pages use `/en/` and `/de/` prefixes (for example `/en/trivia/` and
`/de/trivia/`). The Worker serves the shared HTML with the requested language;
old page URLs redirect to English. The language button navigates to the same
page in the other language. Static assets and API endpoints remain at their
existing root paths. Admin access remains restricted on both language routes.

Trivial Pursuit lives at `/<language>/trivia/trivial-pursuit/` and uses the
`TRIVIA_DB` D1 binding. `GET /api/trivia/random?language=en&category=geography`
selects one random question using the requested `en`/`de` language and one of
the category keys: `geography`, `entertainment`, `history`, `arts`, `science`,
or `sports`. The database must have a `questions` table containing
`id`, `question`, `language`, `category`, `difficulty`, and `answer`.

Run locally with `npx wrangler dev`.
Deploy with `npx wrangler deploy`.

To add a page, copy `templates/page.html` to `public/<page-name>/index.html`
and edit its title and main content. The shared stylesheet and layout script
provide the background, centered content, home logo and footer controls.
Keep `layout.js` before `language.js` so the language button is ready.
For translated page text, add matching keys to both translation JSON files
and use `data-i18n` on the corresponding elements.

Admin is available at `/admin/` (no home-menu link). `ADMIN_IP` in
`wrangler.json` allows only the configured public address via Cloudflare's
`CF-Connecting-IP` header. Update it if your public IP changes. IPv4 and IPv6
are supported, with one address allowed at a time. Do not deploy these static
assets separately on Pages: the Worker must run first to protect admin HTML.

Admin APIs: `GET /api/admin/days`, `GET /api/admin/day?date=YYYY-MM-DD`,
`POST /api/admin/day?date=YYYY-MM-DD` to create, and `PUT` at the same URL to
edit. Writes require same-origin JSON and the `X-Quizzler-Admin: 1` header.
Each save contains exactly 13 bilingual multiple-choice questions. Saves use
a D1 transaction and a unique index on `(quiz_date, position)`. Editing creates
new question rows for that date; historical answer rows retain their original
question references. The existing tables must support auto-generated integer
question IDs and the columns used by the public quiz APIs. No remote schema
changes or production data writes are performed during local tests.
