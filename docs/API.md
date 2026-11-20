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

These routes require an ADMIN session. Student responses include `active` and `createdAt` in addition to the public user fields.

| Method and path | Request and successful response |
| --- | --- |
| GET /admin/dashboard | 200 with `{total, active, inactive}` student counts. |
| GET /users | Optional `search` (case-insensitive name/email) and `page` (starts at 1). Returns `{users, total, page, pageSize}`. |
| GET /users/:id | UUID path parameter. Returns `{user}` for a student. |
| PATCH /users/:id/status | UUID path parameter and `{active: boolean}`. Returns `{user}`. Deactivation revokes sessions and reset links. |

Unknown student UUIDs and administrator UUIDs return 404. Invalid IDs return 400.
