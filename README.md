# Quizzler

# 🧢 [Play at quizzler.cc](https://quizzler.cc)

Quizzler is a **trivia website built with Angular**. Play the daily quiz or get fresh questions for Trivial Pursuit in **German or English**, with no registration needed.

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
| `public/` | HTML entry points, shared styles, translations, images, fonts, and icons. |
| `src/` | Cloudflare Worker APIs, language routing, and admin access controls. |
| `frontend/` | Angular page templates, layout, language service, and game controllers. |
| `tests/` | Automated tests, sample-data preview, and screenshots. |
| `quiz-archive/` | Saved quiz material and notes. |

The daily quiz and Trivial Pursuit use separate Cloudflare D1 databases. `wrangler.json` connects those databases to the Worker and holds the hosting settings. `public/_redirects` keeps a few older page links working.

## Working on it locally

Run **`npm install`** first. Use **`npm run dev`** for the Cloudflare Worker and its local databases or **`npm run preview`** for sample data with no production database writes. Use **`npm test`** for the automated tests.

To add a page, create its component and template under `frontend/`, register it in the app component, and add an HTML entry point under `public/` with the matching `data-view`. Add bilingual labels to both files under `public/translations/`. The Worker serves the entry points and the Angular bundle from `dist/browser/`.

Deploy with **`npm run deploy`**. Keep the Worker in front of the static files: it handles the language URLs and protects the admin area. The allowed admin IP is configured in `wrangler.json` and needs updating if that address changes.
