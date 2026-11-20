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

## Day 4 attempt lifecycle

- The additive migration leaves Day 2 completed attempt fields intact and keeps new lifecycle fields null for those legacy summaries. Modern attempts have a quiz FK, fixed database-clock timestamps, status, grading snapshot and answers. A lifecycle constraint separates legacy, active, and finalized records. The database trigger rejects changes to attempt identity, deadline or snapshot and rejects all updates to finalized records.
- The question/option snapshot is private JSON held on the attempt. The grading key, marks, explanations, and passing threshold are frozen at start. Saved answers use a separate JSON object keyed by question UUID, which keeps one selection per question. The API validates membership within the snapshot and returns a projection of IDs and text only while in progress.
- Each start consumes an attempt. Resuming does not consume another. The current published quiz limit controls new starts, while existing attempts continue with their original snapshot even if the quiz becomes hidden. A partial unique index restricts one active attempt per student and quiz. Start locks the quiz row shared with authoring mutations. Answer saves and finalization acquire the same attempt row lock, so the transaction that commits first determines whether a simultaneous answer is counted.
- PostgreSQL wall time is read after acquiring the relevant locks. At the deadline or later, the next attempt access finalizes it as TIMED_OUT with the original deadline as submission time. The browser anchors its display to server time and sends an expiry-only submission when the countdown reaches zero, retrying while online. No background worker is required. Abandoned attempts with no subsequent access can remain stored as IN_PROGRESS until accessed.
- Incorrect and unanswered questions earn zero. The backend sums the marks on correct responses and divides by the total available marks, then rounds the percentage half up to two decimals. Pass/fail compares the stored rounded percentage with the snapshotted threshold. Elapsed time is whole seconds rounded down, capped at the duration for a timeout.
- Finalized responses show a basic summary. Detailed review, student history, and performance analytics are deferred to Day 5.

## Day 5 results and performance

- Result and history APIs reuse Day 4 attempt storage and expiry handling. No schema changes were needed. Aggregate scores, marks, and counts come from the finalized record. Review renders an explicit projection of immutable snapshots and saved answers after finalization. Administrator access uses a separate completed-only endpoint.
- Legacy attempts keep their stored summaries. Missing marks, review, response counts, lifecycle status, and elapsed time remain unavailable. The dashboard includes legacy scores in finalized attempt totals, pass/fail, average (rounded to two decimals), maximum, and the trend. It sums answered questions only from known correct and incorrect counts, and displays the missing-count limitation.
- The dashboard shows five recent attempts and a chronological Recharts line for up to 20 finalized scores, including timed-out attempts. An empty history has null average and highest scores. The chart loads only when there are scores.
- Returning to a visible attempt tab refreshes that attempt under the same client request guard used by saves and submission. The browser re-anchors to the saved deadline returned by the server. No attempt or deadline is recreated.
