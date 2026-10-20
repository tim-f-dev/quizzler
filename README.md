# Quizzler

# 🧢 [Play at quizzler.cc](https://quizzler.cc)

A website for trivia, with a daily quiz and fresh questions for Trivial Pursuit. Available in **German and English**, with no registration needed to play.

## Daily Quizzler

A daily quiz with **13 multiple-choice questions** and three single-use jokers. Answers are confirmed individually, and the first incorrect answer ends the attempt.

Results show the number of correct answers, the level reached, and the remaining jokers. Questions and answers can be reviewed afterward, and results can be copied or shared.

Progress is saved in the browser, so reloading resumes the attempt or restores its result. If no quiz exists for today, the latest complete quiz is used.

## Trivial Pursuit Questions

Questions for Trivial Pursuit that can be used to play new questions on old board games.

Random questions in six categories: Geography, Entertainment, History, Arts & Literature, Science & Nature, and Sports & Leisure.

Selecting a category loads a question in the current language. Clicking the card flips it to reveal the answer; Continue returns to the category selection. This mode has no scorekeeping.

## Around the site

The homepage leads to **Daily**, **Trivia**, **About**, and **Other**. About and Other are still placeholders for future additions. Legal Notice and Privacy Policy have their own pages.

English pages live under `/en/`, German pages under `/de/`. The language switch takes you to the same page in the other language. The mascot in the top-left corner takes you home.

There's also an **admin page** for managing daily quizzes: choose an existing day, edit its 13 questions and answers in both languages, or create a new day. It isn't linked from the homepage, and both the page and its APIs are restricted to the owner's configured IP address.

## What's in this repository?

| Folder | Contents |
| --- | --- |
| `public/` | Pages, game scripts, shared styles, translations, images, fonts, and icons. |
| `src/` | Cloudflare Worker APIs, language routing, and admin access controls. |
| `templates/` | A starter page using the shared layout. |
| `tests/` | Automated tests, sample-data preview, and screenshots. |
| `quiz-archive/` | Saved quiz material and notes. |

The daily quiz and Trivial Pursuit use separate Cloudflare D1 databases. `wrangler.json` connects those databases to the Worker and holds the hosting settings. `public/_redirects` keeps a few older page links working.

## Working on it locally

Run **`npx wrangler dev`** to work with the Cloudflare setup, or **`node tests/preview.cjs`** for a simple browser preview with sample questions and no production database writes.

To add a page, start with `templates/page.html` and put it in a new folder under `public/`. It already includes the shared styling, mascot home link, footer, and language switch. Add interface text to both translation files when it needs to be bilingual.

Deploy with **`npx wrangler deploy`**. Keep the Worker in front of the static files: it handles the language URLs and protects the admin area. The allowed admin IP is configured in `wrangler.json` and needs updating if that address changes.
