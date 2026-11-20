# Seven-day roadmap

- [x] Day 1. Workspace scaffold, PostgreSQL migration, environment examples, owner provisioning and seed plan, authentication API and reset integration, shared dashboard layout, setup documentation.
- [x] Day 2. Role middleware and dashboard guards, database-backed admin statistics, student search, profile, history and account status controls.
- [x] Day 3. Category, quiz and MCQ CRUD, preview, publish validation and demo content.
- [x] Day 4. Student discovery, eligibility, timed attempts, saved answers and scoring.
- [ ] Day 5. Results, review, history, student dashboard and history integrity verification.
- [ ] Day 6. Admin performance analytics and deterministic leaderboards.
- [ ] Day 7. Regression/security testing, polish, screenshots, release preparation and handoff.

## Day 1 checkpoint

- Applied migration `20261120000000_auth` using `npm run migrate -w backend` against a fresh local PostgreSQL test database.
- `npm test` with `TEST_DATABASE_URL` pointing to that database passed one integration scenario covering registration, duplicate registration, role escalation rejection, owner provisioning, admin/student login, session guard, logout revocation, CORS headers and concurrent reset consumption.
- `npm run build` passed. Browser interaction and hosted CI are unverified.
- PARTIAL verification for reset delivery, which requires a verified Resend domain and sending key. Token handling passed with a test callback.
- Dependency scan reported four high-severity findings in the Prisma CLI development dependency tree. Resolve and recheck before release.
- Next day is Day 2. Reuse the Day 1 authentication middleware for the admin/student role guard and verify status transitions with the local test database.

## Day 2 checkpoint

- Implemented API role middleware, React role guards, database-backed account totals, paginated student search, profiles, and activation controls.
- Added paginated completed attempt history to the admin student profile and a separate archive action. The archive timestamp preserves the account and the PostgreSQL foreign key protects attempts from hard deletion.
- Applied `20261120010000_attempt_history` with `npm run migrate -w backend` against the existing local test database. `npm test` verified identical attempt history before and after archiving, idempotent archival, revoked access, blocked reactivation and restricted hard deletion. The test uses a temporary completed attempt fixture and deletes it at cleanup.
- `npm run build` and `git diff --check` passed. Browser interaction and live reset email delivery remain unverified.
- Next day is Day 3, starting with category and quiz authoring and publish validation.

## Day 3 checkpoint

- Implemented category, quiz, question and option management for administrators. The quiz detail screen previews question content, supports publication and unpublication, and archives quizzes with confirmation. Students can read published metadata through the API. Quiz discovery screens and assessment delivery are Day 4 work.
- `npm run generate -w backend` and `npm run build` passed. The additive `20261120020000_quiz_authoring` migration applied with `npm run migrate -w backend` to the verified loopback Day 2 database `quiz_platform_test`. The same command applied all three migrations to empty `quiz_platform_day3_test`. Prior migration files were untouched. The older local Day 1 checksum discrepancy remains recorded in that database.
- `TEST_DATABASE_URL=<verified-local-url> npm test` passed on each database (2 tests each). Coverage includes Days 1–2 regression, category and quiz CRUD, invalid publishing, question/option validation, student access restrictions, answer redaction, unpublishing, persistence, and serializing concurrent publication and question deletion.
- `SEED_DEMO=1 npm run seed:demo -w backend` with the disposable database URL added five quizzes and added zero on the second run. Read-only PostgreSQL counts confirmed three categories, 15 questions, 45 options and 15 correct options. Separate checks rejected production-mode seeding and remote or non-test integration database URLs before connecting.
- `node /tmp/quiz-day3-browser-smoke.mjs` passed using headless Chrome and Playwright Core installed outside the repository. It exercised the real Vite app, Express API and disposable PostgreSQL database, including login/logout, category create/edit/filter, quiz create/edit, invalid and valid publishing, MCQ and option editing/deletion, unpublishing, refresh persistence, archiving and a 390px viewport overflow check. The first run exposed an accessible label issue that was corrected before the passing run.
- `git diff --check` passed. Existing live email verification and the recorded Prisma CLI dependency findings carry forward. Day 4 is the next checkpoint and was not started.

## Day 4 checkpoint

- Implemented published quiz discovery and details, active attempt continuation, server-verified starts, question navigation, persisted answers, countdown, timeout submission, and basic submission summaries.
- `npm run generate -w backend` passed. `npm run migrate -w backend` applied `20261120030000_student_attempts` to the dedicated loopback Day 3 database and applied all four migrations to empty `quiz_platform_day4_test`. Prisma `migrate status` on `quiz_platform_day3_test` reported the database up to date. A separate upgrade check on `quiz_platform_test` compared a temporary legacy summary before and after migration and verified identical ownership, title, timestamps, score, and pass flag. The first three migration files were untouched. Existing demo data was used for the browser test without editing or reseeding it.
- `TEST_DATABASE_URL=<verified-local-url> npm test` passed on the upgraded `quiz_platform_day3_test` and fresh `quiz_platform_day4_test` (3 tests each). Coverage includes Day 1–3 regressions, concurrent starts, attempts counted on start, visibility, ownership, snapshot isolation, saved answers, correct/incorrect/unanswered and weighted scoring, pass/fail, late saves, expiry after API restart, concurrent save/submit, and idempotent finalization. The attempt suite uses an injected clock with no expiry sleeps.
- `node /tmp/quiz-day4-browser-smoke.mjs` passed in headless Chrome with real Vite, Express, and PostgreSQL. Tested discovery filters, loading, an invalid answer request and invalid attempt page, question navigation, saved answers after reload, the same attempt and deadline across tabs, backend score, and automatic timeout submission with an advanced server test clock. The attempt screen fit 1024px, 1366px, and 390px viewports. The initial smoke script expected a radio to update before the save response. The final check waited for the persisted-answer UI and passed.
- `npm run build` and `git diff --check` passed. Live email verification, the recorded older local migration checksum discrepancy, and the Prisma CLI dependency findings carry forward. An abandoned attempt is finalized on subsequent access. Detailed review and student history remain Day 5 work.
