# Quiz Management & Online Assessment Platform

A React/Vite frontend and an Express REST API backed by PostgreSQL. The current checkpoint covers authentication, student administration, and quiz authoring and publishing. See [roadmap status](docs/ROADMAP_STATUS.md) for the remaining features.

## Local setup

Use Node.js 22.12 or newer and a running PostgreSQL instance. Create a database named `quiz_platform` or use another database you own.

```sh
npm ci
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

The reset email setup is in the [deployment notes](docs/DEPLOYMENT.md).

## Verification

Create a dedicated loopback PostgreSQL database named `quiz_platform_test` (or a variant such as `quiz_platform_day3_test`) and export its connection URL as `TEST_DATABASE_URL`.

```sh
DATABASE_URL="$TEST_DATABASE_URL" npm run migrate -w backend
npm test
npm run build
```

The integration suite writes temporary fixtures to PostgreSQL and exercises the real HTTP application. Use a dedicated test database.

- [API reference](docs/API.md)
- [Implementation decisions](docs/DECISIONS.md)
- [Deployment notes](docs/DEPLOYMENT.md)
