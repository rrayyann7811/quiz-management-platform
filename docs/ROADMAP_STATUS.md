# Seven-day roadmap

- [x] Day 1. Workspace scaffold, PostgreSQL migration, environment examples, owner provisioning and seed plan, authentication API and reset integration, shared dashboard layout, setup documentation.
- [ ] Day 2. Role middleware and dashboard guards, database-backed admin statistics, student search, profile, history and account status controls.
- [ ] Day 3. Category, quiz and MCQ CRUD, preview, publish validation and demo content.
- [ ] Day 4. Student discovery, eligibility, timed attempts, saved answers and scoring.
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
