# Deployment plan

Phase A is local only. The following are proposed destinations, pending identity, availability and owner approval. If a name resolves to an existing unrelated project or repository, stop and confirm a different target. No endpoint below is a verified deployment.

| Service | Proposed destination | Plan and account |
| --- | --- | --- |
| GitHub | `https://github.com/rrayyann7811/quiz-management-platform`, branch `main` | New public repository under `rrayyann7811`. Confirm the logged-in owner and absence of an existing repository after approval. |
| Vercel | Project `quiz-management-platform`, candidate `https://quiz-management-platform.vercel.app` | Hobby in the owner's selected personal team. Confirm the team and canonical production hostname. |
| Render | Web service `quiz-management-platform-api`, candidate `https://quiz-management-platform-api.onrender.com` | Free Node web service in the owner's selected workspace. Confirm the workspace, region and assigned hostname. |
| Neon | Project `quiz-management-platform`, branch `production`, database `quiz_platform` | Free in the owner's selected organization. Confirm the organization, region and branch ID. Separate disposable `migration-rehearsal` branch if approved. |
| Resend | Owner-controlled verified sending domain | Free transactional email via HTTPS. The sending domain and Resend workspace need owner confirmation. |

The proposals target $0 hosting for a personal, non-commercial portfolio demo within plan limits. Domain registration, paid plans, and overages need separate approval. Hosted destinations and billing settings must be checked before provisioning.

- Vercel Hobby is for personal, non-commercial use and enforces usage limits. Select Node 24.x. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Node 24.x](https://vercel.com/changelog/node-js-24-lts-is-now-generally-available-for-builds-and-functions)
- Render Free web services sleep after 15 minutes idle, can take roughly a minute to wake, use ephemeral disks, and share 750 free instance hours per workspace per month. Outbound SMTP ports 25, 465 and 587 are blocked. Free Render PostgreSQL expires after 30 days. [Render Free](https://render.com/docs/free)
- Neon Free includes 100 CU-hours per project per month, 1 GB storage per project, 5 GB public network transfer per project per month, and scale-to-zero after five idle minutes. Compute or network quota exhaustion can suspend service. Free restore history is limited. [Neon plans](https://neon.com/docs/introduction/plans)
- Resend Free allows 100 messages per day and 3,000 per month. Public reset delivery requires a verified domain. Use a sending-only key restricted to that domain, with click and open tracking disabled for reset links. [Resend pricing](https://resend.com/pricing) · [Verified domains](https://resend.com/docs/dashboard/domains/introduction)

## Environment variables

| Scope | Variable names | Purpose |
| --- | --- | --- |
| Vercel build | `VITE_API_URL` | Public HTTPS API origin with `/api`. This is compiled into the frontend. |
| Render | `NODE_ENV`, `NODE_VERSION`, `PORT` | Production mode, supported Node 24.x, and the platform-provided port. |
| Render | `DATABASE_URL`, `FRONTEND_ORIGIN`, `TRUST_PROXY_HOPS` | Private Neon runtime connection, exact HTTPS canonical frontend origin, and a proxy hop count verified against the deployed ingress. |
| Render | `RESEND_API_KEY`, `RESET_FROM` | Both set privately once the sender is verified. |
| Owner-only terminal | `DATABASE_URL`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | A verified direct connection and temporary administrator provisioning inputs. |
| Local/CI only | `TEST_DATABASE_URL`, `SEED_DEMO` | Dedicated loopback test connection and explicit development quiz seed flag. |

Use the official hosting dashboards and Neon connection dialog. Use a secure local environment loader or a hidden terminal prompt for owner-only operations. Keep credentials out of shell commands, chat, frontend build variables, screenshots, reports and Git. The local test environment and demo seed are separate from runtime.

## Workspace build and start

Both providers must start in the repository root, where the npm workspaces and lockfile live.

| Target | Settings |
| --- | --- |
| Vercel | Root `.`, Vite framework, Node 24.x. `npm ci --include=dev`, `npm run build -w frontend`, output `frontend/dist`. Root [vercel.json](../vercel.json) rewrites app routes to `/index.html` and sets browser security headers. If the final API hostname differs from the proposed one, update the CSP and verify the reviewed commit before release. |
| Render | Root unset (repository root), Node runtime, `NODE_VERSION=24.x`. Build with `npm ci --include=dev && npm run generate -w backend`. Start with `npm run start -w backend`. Health path `/api/health`. The API binds the provided port on all interfaces in production. Leave automatic deploys disabled until the approved release and CI checks are verified. |

The local static preview checks the rewrite rules and direct route behavior with a loopback API. Hosted route resolution, ingress, CORS, and CSP remain Phase B checks. The API uses an opaque bearer in per-tab browser storage and does not use cookies for authentication. Keep the origin exact and verify preflights for `Authorization` and `Content-Type` from the approved frontend. [Vite deployment docs](https://vercel.com/docs/frameworks/frontend/vite) · [Render monorepos](https://render.com/docs/monorepo-support) · [Render Node runtime](https://render.com/docs/node-version)

## Neon migration and recovery

1. After approval, confirm the Neon account, project, branch, endpoint, database and private role against the official console. Use PostgreSQL 18 to match the local rehearsal. Use a TLS connection with `sslmode=require` or stronger supported verification. Use a pooled runtime connection from the Neon dialog, with a small Prisma pool appropriate for a single Render service. Use a direct, non-pooler connection for migration, backup and owner provisioning. For this Prisma v6 project, supply the direct connection as `DATABASE_URL` only in the migration terminal. [Neon Prisma guide](https://neon.com/docs/guides/prisma)
2. Before writes, use the direct TLS connection for a read-only identity check. Compare the private endpoint identity from the console and the observed `current_database()`, `current_user`, `inet_server_addr()`, schema, and TLS state. Inspect `to_regclass('public._prisma_migrations')`. If it exists, compare all names, successful apply states, and SHA-256 checksums against the reviewed files. An unexpected schema or checksum stops deployment. The older local checksum mismatch must stay outside production.
3. Rehearse on a disposable approved branch/database first. Take a Neon snapshot or branch from the intended pre-change point and keep an encrypted, access-restricted `pg_dump` if the database already holds user data. Test restore into a separate branch. Run `npm exec -w backend -- prisma migrate status`, then `npm run migrate -w backend` with the reviewed direct connection. For a new empty database, the initial status reports pending migrations. Verify all five migrations applied and inspect constraints, indexes and representative read-only queries. Do not use `migrate dev`, `db push`, `reset` or seed fixtures against production. [Prisma v6 production migrations](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production)
4. If verification fails, stop traffic and preserve the failed branch for investigation. Prefer pinning the last working application revision when the schema remains compatible. For database recovery, rehearse restoration into a new branch, assess writes since the restore point, and obtain separate approval before switching connections. Keep the original database and snapshots until the owner signs off.
5. Once accepted, run the owner CLI `npm run seed:admin -w backend` once with private temporary administrator values and the verified direct connection. Clear provisioning variables afterward. The CLI rejects a student email and leaves an existing administrator unchanged. The application starts without provisioning credentials. New production databases start without quizzes until the owner authors and publishes content.

## Approved Phase B verification

1. Confirm exact account destinations, publication name, free-tier choices, and reviewed Git SHA. Verify the new repo is available. Push only after authorization and compare the remote branch SHA.
2. Verify hosted CI, run the approved migration and provisioning sequence, and check Render HTTPS health and database-backed endpoints. Deploy the Vercel frontend and verify direct paths, exact-origin CORS, session revocation, and connectivity with normal browser requests.
3. Verify both role flows, correct-answer hiding, ownership boundaries, mobile and desktop display, persistence, server restart/idle wakeup, analytics and ranking. Cold starts can outlast a client request. Retry after the service is awake and verify recovery without changing the recorded quiz deadline.
4. Configure the verified Resend sending domain and key, send to an owner-controlled inbox, follow the reset link, and verify one-time use, expiry and old-session revocation. Local browser testing uses a simulated inbox. Live delivery is a release gate unless the owner explicitly chooses a partial release scope.
5. Update the README with verified URLs and SHA. Capture the login, student browse/review/dashboard, and admin analytics screens on desktop and mobile using authorized disposable accounts. Crop URLs and redact names, emails, tokens, and browser developer panels. Publish only reviewed screenshots and remove specifically identified release fixtures only with approval.
