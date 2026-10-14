# quizzler

Static site assets live in `public/`. The Worker entry point is
`src/index.js`, configured in `wrangler.json`.

Run locally with `npx wrangler dev`.
Deploy with `npx wrangler deploy`.

To add a page, copy `templates/page.html` to `public/<page-name>/index.html`
and edit its title and main content. The shared stylesheet and layout script
provide the background, centered content, home logo and footer controls.
Keep `layout.js` before `language.js` so the language button is ready.
For translated page text, add matching keys to both translation JSON files
and use `data-i18n` on the corresponding elements.
