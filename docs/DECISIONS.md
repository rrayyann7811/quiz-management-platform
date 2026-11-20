# Implementation decisions

- Use one npm workspace with ES modules, JavaScript and Prisma migrations. Keep the local and hosted database engines PostgreSQL.
- Use an opaque 256-bit bearer session with an eight-hour expiration. PostgreSQL stores only its SHA-256 digest. Each authenticated request checks the user's current status. The frontend holds the bearer in per-tab session storage to support refresh, so script injection could read it. The application explicitly sends the Authorization header and uses exact-origin CORS. Browsers do not automatically attach this header, so cookie-based CSRF does not apply. Use HTTPS for both deployed origins.
- Use bcrypt with cost 12 and enforce its 72-byte input limit. The reset token is random, digested in storage, valid for 30 minutes and consumed transactionally. An account-level lock coordinates reset and login, and password reset revokes existing sessions.
- Owner-only provisioning accepts environment variables. Demo quiz seeding is planned for Day 3 as a repeatable, development-only script with no precomputed attempt history.
- History design for Days 4–5 will snapshot question and option content, marking data, and quiz metadata when an attempt starts. Keep archived records available to historical views.
- Deactivating a student preserves the user record and revokes sessions and reset links in the same transaction. Reactivation lets the student sign in again with a new session.

- Day 2 stores completed attempt summaries in the `Attempt` table so the admin profile can read actual PostgreSQL records. The quiz title is stored on the attempt and the student foreign key restricts hard deletion. The scoring and active-attempt lifecycle arrive in Day 4.
- Archiving records a timestamp, disables the account, and revokes sessions and reset links atomically. An archived account remains visible to admins for historical review and cannot be activated through the ordinary status endpoint.
