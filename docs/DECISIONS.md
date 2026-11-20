# Implementation decisions

- Use one npm workspace with ES modules, JavaScript and Prisma migrations. Keep the local and hosted database engines PostgreSQL.
- Use an opaque 256-bit bearer session with an eight-hour expiration. PostgreSQL stores only its SHA-256 digest. Each authenticated request checks the user's current status. The frontend holds the bearer in per-tab session storage to support refresh, so script injection could read it. The application explicitly sends the Authorization header and uses exact-origin CORS. Browsers do not automatically attach this header, so cookie-based CSRF does not apply. Use HTTPS for both deployed origins.
- Use bcrypt with cost 12 and enforce its 72-byte input limit. The reset token is random, digested in storage, valid for 30 minutes and consumed transactionally. An account-level lock coordinates reset and login, and password reset revokes existing sessions.
- Owner-only provisioning accepts environment variables. Demo quiz seeding is planned for Day 3 as a repeatable, development-only script with no precomputed attempt history.
- History design for Days 4–5 will snapshot question and option content, marking data, and quiz metadata when an attempt starts. Keep archived records available to historical views.
- Deactivating a student preserves the user record and revokes sessions and reset links in the same transaction. Reactivation lets the student sign in again with a new session.

- Day 2 stores completed attempt summaries in the `Attempt` table so the admin profile can read actual PostgreSQL records. The quiz title is stored on the attempt and the student foreign key restricts hard deletion. The scoring and active-attempt lifecycle arrive in Day 4.
- Archiving records a timestamp, disables the account, and revokes sessions and reset links atomically. An archived account remains visible to admins for historical review and cannot be activated through the ordinary status endpoint.

## Day 3 authoring

- Categories use a case-insensitive unique index. Deleting a referenced category is blocked, including references from archived quizzes. Quiz deletion sets an archive timestamp and removes the quiz from all authoring and student lists.
- Admins unpublish a quiz before editing quiz metadata or questions. Quiz changes and question mutations acquire the same PostgreSQL row lock used during publication so a content edit cannot invalidate a concurrent publish. SQL constraints bound numeric settings and enforce at most one correct option per question. Question writes and publication checks enforce the minimum of two options and exactly one correct option.
- Quiz list and detail responses use an explicit metadata projection. Correct flags and explanations appear only in the administrator question endpoints. The existing completed attempt summary is independent of authored content. Day 4 will handle assessment snapshots for durable question-level review.
- Demo content uses stable quiz keys so repeat runs preserve edits and archived records. Seeding requires explicit opt-in and a local quiz database, refuses production mode, and creates no accounts or attempts.
