# Seven-day roadmap

- [x] Day 1. Workspace scaffold, PostgreSQL migration, environment examples, owner provisioning and seed plan, authentication API and reset integration, shared dashboard layout, setup documentation.
- [x] Day 2. Role middleware and dashboard guards, database-backed admin statistics, student search, profile, history and account status controls.
- [x] Day 3. Category, quiz and MCQ CRUD, preview, publish validation and demo content.
- [x] Day 4. Student discovery, eligibility, timed attempts, saved answers and scoring.
- [x] Day 5. Results, review, history, student dashboard and history integrity verification.
- [x] Day 6. Admin performance analytics and deterministic leaderboards.
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

## Day 5 checkpoint

- Added student result and review pages, paginated attempt history, and a database-backed dashboard with finalized totals, pass/fail counts, score averages and maximums, known answered-question counts, recent attempts and a Recharts score trend. Admins can open completed results from student profiles through a separate admin route.
- No database schema or migration changes. `npm run generate -w backend` passed. `prisma migrate status --schema backend/prisma/schema.prisma` verified all four migrations applied to the dedicated loopback `quiz_platform_day3_test` database.
- `TEST_DATABASE_URL=<verified-local-url> npm test` passed four backend integration scenarios and one frontend timer-resume regression test. Coverage includes Day 1–4 behavior, owned and foreign access, active-attempt redaction, correct/incorrect/unanswered and weighted review, timeout settlement, immutable history after editing and archiving, legacy summaries, pagination, sorting, empty dashboards and persisted aggregations.
- `node /tmp/quiz-day5-browser-smoke.mjs --reproduce-timer` reproduced a stale displayed countdown under simulated inactivity before the fix. `node /tmp/quiz-day5-browser-smoke.mjs` passed in headless Chrome after adding server resync and correcting a mobile table overflow. It covered real login, empty dashboard, discovery, start, saved answers, submission and score, result loading and refresh, review navigation and statuses, history links, database-backed stats, one- and two-point charts, invalid result handling, mobile layout at 390px, and visibility/focus recovery of a timed-out attempt.
- `npm run build` and `git diff --check` passed. Legacy attempts remain summary-only and the dashboard explains their unavailable question counts. Live email delivery, the older local checksum discrepancy, and the previously recorded Prisma CLI dependency findings carry forward. Day 6 has yet to start.

## Day 6 checkpoint

- Added platform statistics, date-filtered attempt and registration trends, pass/fail distribution, quiz results and popularity, and history-preserving category analytics. The admin dashboard and reports read real PostgreSQL aggregates and Recharts uses the API series.
- Added authenticated overall and category leaderboards with UTC weekly/monthly filters, bounded pagination, deterministic ties, and admin-only manual exclusions. Exclusions leave finalized results and analytics unchanged.
- `npm run generate -w backend` passed. `npm run migrate -w backend` added `20261120040000_analytics_leaderboard` to the verified loopback database `quiz_platform_day3_test`, and `prisma migrate status` reported up to date. All five migrations also applied to empty `quiz_platform_day6_test`. Earlier migration files and attempt records were untouched.
- `TEST_DATABASE_URL=<verified-local-url> npm test` passed on both databases (six backend scenarios and one frontend unit test each). Reporting coverage includes role denial, publication and question counts, finalized scores, passing timeouts, date buckets, historical categories, archived quiz metrics, legacy data, rankings, tie ordering, period boundaries, filters, and exclusion isolation. The backend suite runs scenarios serially so platform count assertions have isolated fixtures.
- `node /tmp/quiz-day6-browser-smoke.mjs` passed in headless Chrome using Vite, Express, and PostgreSQL. It verified a real submission, admin counts and three charts, date grouping and empty ranges, report navigation, rule display, exclusion and restore, student category and period filters, access denial, loading, and 390px/1366px layouts. Initial browser runs revealed filter-transition timing and chart resize sensitivity. The final flow tested controlled forms after each API response and checked layout after chart resizing settled.
- `npm run build` and Git whitespace checks passed. Live reset email verification, the older local checksum discrepancy, and recorded Prisma CLI dependency findings remain open. Day 7 has yet to start.

## Day 7 Phase A

**Local verification PASS. Public release BLOCKED pending owner-approved targets and a verified email sender or explicit partial-release scope.** Day 7 remains open until Phase B and public smoke tests pass.

| Gate | Status and evidence |
| --- | --- |
| Day 1 auth and roles | PASS locally. Tests cover registration, owner-only Admin provisioning, generic reset responses, expiry, one-time use, and session revocation. Chrome verified reset-link reload and rejected expired sessions on a protected request. Local CORS tested allowed and foreign origins. |
| Day 2 student administration | PASS locally. Integration and extended Chrome smoke verified profile access, deactivation, archive, and preservation of completed attempt history and review. |
| Day 3 authoring | PASS locally. Integration and Chrome verified category/quiz/MCQ CRUD, validation, publication, unpublication, and archive. |
| Day 4 attempts and timer | PASS locally. Integration and Chrome verified concurrent starts and save/submit, weighted scoring, server expiry after restart, answers restored after refresh, second-tab continuation, late-save rejection and duplicate submission. |
| Day 5 results and dashboard | PASS locally. Integration and Chrome verified ownership, snapshots, legacy summaries, result review/refresh, history and charts. History page and count now use one database statement snapshot. |
| Day 6 analytics and ranking | PASS locally. Tests cover weekly/monthly UTC boundaries independently, deleted-category history, roles, ties, and exclusion isolation. Frontend regression rejects stale successes and failures. Chrome verified real reports, chart/data filters, exclusions, restored rankings, and role denial. |
| Local database and dependencies | PASS. Verified a fresh loopback `quiz_platform_day7_test` database. All five original migration files applied unchanged, status was up to date. Both final dependency audits reported zero advisories after targeted overrides. |
| Local release build, browser and security | PASS. Clean root workspace install, Prisma generation, root API start/health, production Vite build, protected direct SPA routes, 390px through 1366px viewports, input errors and empty/loading states. Redacted Git and file scans found no secrets. |
| Documentation and CI configuration | PASS locally. Deployment plan, security notes, README, examples, screenshot plan, and Actions workflow are prepared. Hosted Actions remains NOT VERIFIED. |
| Hosted database, API, frontend, and email | NOT VERIFIED. No publication or provisioning was performed. Owner confirmation of the exact destinations and sender remains pending. |

### Executed checks

- `npm ci --include=dev`, `npm run generate -w backend`, `npm run migrate -w backend`, and `npm exec -w backend -- prisma migrate status` exited 0 in the clean release copy against the verified local test setup. The API command `npm run start -w backend` served real database-backed health on the supplied port.
- `npm test` exited 0 with 7 backend and 3 frontend tests. `npm run build -w frontend`, JavaScript syntax checks, and `git diff --check` exited 0. The test guard rejected production mode and non-loopback targets.
- `npm audit --audit-level=high` and `npm audit --omit=dev --audit-level=high` initially exited 1. Both exited 0 after remediation with zero advisories. [Audit disposition](SECURITY.md#dependency-audit-disposition)
- Five local Chrome smoke harnesses exited 0. They used the built frontend or Vite, Express, and a verified local PostgreSQL database. One harness loaded the built output with the checked-in SPA rules and local API CSP equivalent. Reset used an in-memory inbox. This verifies app behavior and does not verify delivery or hosted routing.
- Gitleaks 8.30.1 scanned all reachable Git history and the reviewed file tree with redaction. Local ignored paths and migration files were checked. The Day 1 mismatch is confined to an older local test database previously shown to differ by a trailing newline. Production migration history remains a separate verification gate.

See the [deployment plan](DEPLOYMENT.md) for proposed names, limits, environment variables, migration safety, and Phase B acceptance steps.

### Day 7 Phase B checkpoint

- The owner approved the named Free/Hobby deployment targets and explicitly deferred live email delivery. The public reset form shows its unavailable state when the backend has no sender, and requests return `503` without issuing tokens.
- The reviewed source is published at [the approved GitHub repository](https://github.com/rrayyann7811/quiz-management-platform). Hosted CI passed after moving disposable PostgreSQL to runner loopback and keeping the test safety guard. [Hosted CI run](https://github.com/rrayyann7811/quiz-management-platform/actions/runs/44788961753)
- Local Chrome verified both reset availability states and direct navigation to the leaderboard on the production bundle. Neon project and branch identity, migrations, owner provisioning, and public Render/Vercel runtime checks remain pending.
