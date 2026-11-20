# API reference

All paths are relative to `/api`. JSON requests use `Content-Type: application/json`. Protected requests use `Authorization: Bearer <token>`.

| Method and path | Access | Request and successful response |
| --- | --- | --- |
| GET /health | Public | 200 with `{status: "ok"}` when the database is reachable, 503 otherwise. |
| POST /auth/register | Public | `{name, email, password}` → 201 with `{user}`. Creates a STUDENT. |
| POST /auth/login | Public | `{email, password}` → 200 with `{token, user}`. |
| GET /auth/me | Signed in | 200 with `{user}`. |
| POST /auth/logout | Signed in | 204, revokes the current session. |
| POST /auth/forgot-password | Public | `{email}` → 202 with a generic message. Sends email for eligible accounts when configured. |
| POST /auth/reset-password | Public | `{token, password}` → 204 and revokes all sessions for the account. |
| GET /admin/session | ADMIN | 200 with `{user}`. |

The user object includes `id`, `name`, `email`, and `role`. Errors return `{message}` and field validation errors also include `errors`. Statuses include 400 for invalid input, 401 for missing or invalid authentication, 403 for the wrong role, 409 for a duplicate registration, and 429 for rate limits.

## Student administration

These routes require an ADMIN session. Student responses include `active`, `createdAt`, and `archivedAt` in addition to the public user fields.

| Method and path | Request and successful response |
| --- | --- |
| GET /admin/dashboard | 200 with `{total, active, inactive, archived}` student counts. The inactive count covers deactivated accounts. |
| GET /users | Optional `search` (case-insensitive name/email) and `page` (starts at 1). Returns `{users, total, page, pageSize}`. |
| GET /users/:id | UUID path parameter. Returns `{user}` for a student. |
| GET /users/:id/attempts | UUID and optional `page` (starts at 1). Returns `{attempts, total, page, pageSize}` with completed attempt summaries ordered newest first. |
| DELETE /users/:id | Archives the student, revokes sessions and reset links, and returns `{user}`. Repeat calls return the existing archived account. |
| PATCH /users/:id/status | UUID path parameter and `{active: boolean}`. Returns `{user}`. Deactivation revokes sessions and reset links. |

Unknown student UUIDs and administrator UUIDs return 404. Invalid IDs return 400.

Attempt summaries contain `id`, `quizTitle`, `startedAt`, `finalizedAt`, numeric percentage `score`, and `passed`. Archived students remain visible to admins with their history. Changing an archived account’s status returns 409.

## Quiz authoring

All endpoints require a session. The list and detail endpoints available to students return only published, non-archived quiz metadata. The question endpoints are administrator-only, including reads.

| Method and path | Access | Request and successful response |
| --- | --- | --- |
| GET /categories | ADMIN, STUDENT | `{categories}`. Students see categories with visible quizzes. |
| POST /categories | ADMIN | `{name}` → 201 with `{category}`. |
| GET /categories/:id | ADMIN | `{category, quizzes}` with non-archived quizzes in the category. |
| PATCH /categories/:id | ADMIN | `{name}` → `{category}`. |
| DELETE /categories/:id | ADMIN | 204. A category referenced by any quiz returns 409. |
| GET /quizzes | ADMIN, STUDENT | Optional UUID `categoryId` filter → `{quizzes}`. |
| GET /quizzes/:id | ADMIN, STUDENT | `{quiz}`, including the question count in `_count.questions`. |
| POST /quizzes | ADMIN | Quiz payload → 201 with `{quiz}` in DRAFT status. |
| PATCH /quizzes/:id | ADMIN | Full quiz payload → `{quiz}`. Available while draft or unpublished. |
| DELETE /quizzes/:id | ADMIN | 204. Archives and unpublishes the quiz. |
| POST /quizzes/:id/publish | ADMIN | `{published: boolean}` → `{quiz}`. A quiz that fails publication checks returns 422. |
| GET /quizzes/:quizId/questions | ADMIN | `{questions}` with the correct options and explanations for preview. |
| POST /quizzes/:quizId/questions | ADMIN | Question payload → 201 with `{question}`. |
| GET /questions/:id | ADMIN | `{question}` with its ordered options. |
| PATCH /questions/:id | ADMIN | Full question payload including the replacement option set → `{question}`. |
| DELETE /questions/:id | ADMIN | 204. Deletes the question and its options. |

Category names are trimmed, 2–80 characters, and unique case-insensitively. The quiz payload includes `title`, `description`, `categoryId`, `difficulty`, `durationMinutes` (1–240), `passingPercent` (0–100), `maxAttempts` (1–20), and optional `thumbnailUrl` (HTTP(S) URL or null). Difficulty is `EASY`, `MEDIUM`, or `HARD`. Status transitions use the publish endpoint.

The question payload includes `text`, `explanation`, `difficulty`, `marks` (1–100), and 2–6 `options` in display order. Each option contains `text` and boolean `isCorrect`. Exactly one option must be correct. Editing the question replaces the previous option set transactionally.

Malformed input returns 400. Missing records and quizzes hidden from students return 404. Student calls to administrator-only endpoints return 403. Duplicate categories, category deletion with references, and attempts to edit published quizzes return 409.

## Student discovery and attempts

`GET /quizzes` also accepts `search` (case-insensitive title substring), `difficulty`, `minDuration` and `maxDuration` in minutes, and `sort` (`recent` for newest first or `title`, the default). The student browse screen defaults to `recent`. Existing student visibility rules still apply.

All attempt routes require an active STUDENT session. An unknown attempt ID or an attempt owned by another student returns 404. A malformed ID or payload returns 400.

| Method and path | Request and successful response |
| --- | --- |
| GET /quizzes/:quizId/eligibility | Published quiz → `{remainingAttempts, activeAttemptId}`. The active ID is null when there is no valid open attempt. |
| POST /quizzes/:quizId/start | Empty body or `{}` → `{attempt}`, with 201 for a new attempt or 200 when continuing an existing one. Hidden quizzes return 404 and an exhausted limit returns 409. |
| GET /attempts/active | `{attempts}` containing only active `{id, quizTitle, expiresAt}` entries. Includes active attempts for quizzes since unpublished or archived. |
| GET /attempts/:attemptId | `{attempt}`. Finalizes an expired attempt before returning it. |
| PUT /attempts/:attemptId/answers | `{questionId, optionId}` → echoes the saved IDs. Replaces the prior selection for that question. A foreign option returns 400. An expired or finalized attempt rejects saves with 409. |
| POST /attempts/:attemptId/submit | Empty body, `{}`, or `{onlyIfExpired: boolean}` → `{attempt}`. When `onlyIfExpired` is true, calls before expiry return the active attempt. Repeated submissions return the stored result. |

An attempt response contains `id`, `quizId`, `quizTitle`, `status`, `startedAt`, `expiresAt`, and `serverNow`. In progress it also contains `questions` (question and option IDs and text) and `answers` (question UUID to selected option UUID). The finalized response contains `finalizedAt` and `summary` with `totalQuestions`, `correctCount`, `incorrectCount`, `unansweredCount`, `maximumMarks`, `obtainedMarks`, `percentage`, `passed`, and `elapsedSeconds`. The response never returns grading keys or explanations at this checkpoint.

## Finalized results, history and student dashboard

| Method and path | Access | Request and successful response |
| --- | --- | --- |
| GET /attempts/:attemptId/result | STUDENT | Returns `{result}` for an owned, finalized attempt. Overdue attempts finalize first. A still-active owned attempt returns 409. Missing or foreign IDs return 404. |
| GET /attempts | STUDENT | Optional `page` (default 1) and `pageSize` (default 10, maximum 50). Returns `{attempts, total, page, pageSize}` for finalized attempts, newest completion first with ID as a stable tie-breaker. Overdue attempts are settled first. |
| GET /student/dashboard | STUDENT | Returns `{stats, activeAttempts, recentAttempts, scoreTrend}`. Recent attempts contain up to five entries. The trend is the latest 20 finalized scores ordered chronologically, with IDs, titles, completion times and percentages. |
| GET /admin/attempts/:attemptId/result | ADMIN | Returns `{result, student: {id, name}}` for a finalized student attempt. An active or unknown attempt returns 404. |

History summaries contain `id`, `quizTitle`, `finalizedAt`, `percentage`, `passed`, `elapsedSeconds` and `status`. A detailed result adds `totalQuestions`, `correctCount`, `incorrectCount`, `unansweredCount`, `maximumMarks`, `obtainedMarks`, and `review`. Review entries contain the question number, text, explanation, option IDs and text, selected option ID (or null), correct option ID, status (`CORRECT`, `INCORRECT`, or `UNANSWERED`), maximum question marks and awarded marks. Raw snapshot and answer-map fields are excluded. Legacy summaries retain their stored title, completion date, score and outcome. Missing metrics and review data are null.

Dashboard `stats` contains `totalAttempts`, `passedAttempts`, `failedAttempts`, `averageScore`, `highestScore`, `answeredQuestions`, and `missingQuestionCounts`. Only finalized attempts count in statistics. Timed-out and legacy scores are included. Average and maximum are null for an empty history. Answered questions sum correct plus incorrect counts where available, with a separate tally of legacy attempts missing these counts.

## Admin analytics

`GET /admin/dashboard` requires ADMIN and returns platform totals plus the existing account count aliases `total`, `active`, `inactive`, and `archived`.

`GET /admin/analytics` requires ADMIN. Query parameters:

| Parameter | Values |
| --- | --- |
| `from`, `to` | Inclusive UTC dates, `YYYY-MM-DD`. Default is a 30-day window ending today or on the requested end date. Range limit is 366 days. |
| `group` | `day` (default), `week` (Monday starts), or `month`. |
| `limit` | 1–50 rows, default 10. Applies to quiz performance, category performance, and popularity. |
| `quizPage`, `categoryPage` | Independent one-based page numbers, default 1. |

The response contains `filters`, all-time `platform` statistics, `attemptTrends` (`date`, `attempts`), `studentRegistrations` (`date`, `registrations`), `passFail`, `quizPopularity`, `quizPerformance`, and `categoryPerformance`. Performance tables use `{rows, page, hasMore}`. Popularity is limited and sorted by persisted starts, then current title and ID. Quiz results include stored score aggregates, current title and category, and archive state. Category results include current quiz inventory and attempt aggregates attributed to the category saved in each snapshot. Time buckets are labeled by their start and include zero-count periods. Registrations count STUDENT accounts by creation date. Starts and outcome metrics use their own timestamps, so a window can include completions of attempts started earlier.

## Leaderboards

| Method and path | Access | Request and response |
| --- | --- | --- |
| GET /leaderboard | ADMIN, STUDENT | Optional `categoryId`, `period` (`overall`, `weekly`, `monthly`), `page` (default 1), `limit` (1–50, default 15). Returns `{entries, categoryId, period, page, limit, hasMore}`. Students receive only `rank`, `displayName`, `averageScore`, `highestScore`, and `quizzesCompleted`. Admin entries also contain `studentId` for management. |
| GET /leaderboard/categories | ADMIN, STUDENT | Returns `{categories}` with category IDs and labels, including historical IDs referenced by finalized attempts. |
| GET /admin/leaderboard/exclusions | ADMIN | Optional `page` and `limit` as above. Returns `{students, page, limit, hasMore}` for manually excluded students. |
| PATCH /admin/leaderboard/exclusions/:id | ADMIN | `{excluded: boolean}` sets or clears the manual exclusion and returns `{id, excluded}`. |

Leaderboard periods use the current UTC calendar week (Monday through now) and month (first day through now), based on finalization time. Both roles must authenticate. Invalid filters return 400. An unknown, valid category UUID yields an empty ranking.

History page rows and the total count are read in the same PostgreSQL statement snapshot, including when another request finalizes an attempt concurrently.
