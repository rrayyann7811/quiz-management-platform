# Quiz Management & Online Assessment Platform

A React/Vite frontend and an Express REST API backed by PostgreSQL. The two roles are **ADMIN** and **STUDENT**.

- Students discover published quizzes, resume timed attempts, save answers, review finalized results, track performance, and view leaderboards.
- Administrators manage student accounts, author and publish quizzes, inspect historical results, view platform analytics, and manage leaderboard exclusions.
- The server enforces deadlines, scoring, attempt limits, and access. PostgreSQL stores saved selections, score history, and immutable question snapshots.

**Release status:** [public source repository](https://github.com/rrayyann7811/quiz-management-platform). Hosted application URLs remain unverified. Email-based password reset is temporarily unavailable without a verified sender. See [roadmap status](docs/ROADMAP_STATUS.md).

## Architecture

- `frontend/` — React, Vite, Tailwind, React Router, Axios and Recharts.
- `backend/` — Express API, Zod validation, bearer authentication, and Prisma/PostgreSQL.
- `backend/prisma/migrations/` — version-controlled PostgreSQL migrations.
- `docs/` and `.github/workflows/` — API and release notes, and the local-database CI workflow.

## Local setup

Use Node.js 24 LTS and a running PostgreSQL instance. Create a database named `quiz_platform` or use another database you own.

```sh
npm ci --include=dev
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Set `DATABASE_URL` in `backend/.env` to your local PostgreSQL URL. Then run:

```sh
npm run generate -w backend
npm run migrate -w backend
npm run dev
```

Open `http://localhost:5173`. The API serves `http://localhost:4000/api` and reports database availability at `/api/health`.

To provision an administrator, set `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` in the backend environment. Run `npm run seed:admin -w backend`, then remove the provisioning password from your environment. Repeat runs leave existing administrators alone and reject addresses already registered to students. Students register in the app.

To add five demonstration quizzes to a local development database, run:

```sh
SEED_DEMO=1 npm run seed:demo -w backend
```

The demo seed requires a local database named `quiz_platform` or a variant such as `quiz_platform_dev`. It creates quiz content and leaves existing accounts untouched.

Local configuration uses `DATABASE_URL`, `FRONTEND_ORIGIN`, and `PORT` on the API, and `VITE_API_URL` on the frontend. `RESEND_API_KEY` and `RESET_FROM` are private backend settings for real reset email. See [deployment notes](docs/DEPLOYMENT.md) for provider configuration and [security notes](docs/SECURITY.md) for trust boundaries and operational caveats.

## Verification

Create a dedicated loopback PostgreSQL database named `quiz_platform_test` (or a variant such as `quiz_platform_day3_test`) and export its connection URL as `TEST_DATABASE_URL`.

```sh
DATABASE_URL="$TEST_DATABASE_URL" npm run migrate -w backend
npm test
npm run build
```

The integration suite writes temporary fixtures to PostgreSQL and exercises the real HTTP application. Use a dedicated test database. The GitHub Actions workflow repeats migration, audit, tests, and build checks. Hosted CI has yet to run. See the [Day 7 evidence](docs/ROADMAP_STATUS.md#day-7-phase-a).

- [API reference](docs/API.md)
- [Implementation decisions](docs/DECISIONS.md)
- [Deployment notes](docs/DEPLOYMENT.md)
