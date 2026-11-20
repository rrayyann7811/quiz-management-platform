# Security and release checks

- Only ADMIN and STUDENT roles exist. Public registration creates STUDENT accounts. The private owner CLI provisions administrators. Server role guards, active-account checks and attempt ownership checks protect routes; frontend guards provide navigation.
- Sessions use opaque random bearer tokens stored as digests in PostgreSQL. Passwords use bcrypt. Reset tokens are short-lived, digested in storage, and consumed once. Reset links retain the fragment through reload and remove it on successful navigation. The frontend uses no-referrer and has no analytics integration. Live reset delivery requires verified Resend configuration and remains unverified.
- The server validates payloads, rate limits traffic, uses Helmet and permits one configured frontend origin. The production server requires HTTPS for the frontend origin. API authorization is explicit, so browsers do not attach authentication cookies. Frontend script confinement matters because script execution can read tab session storage. The Vercel config limits script and connection sources and blocks framing.
- PostgreSQL owns attempt deadlines and results. Transactions serialize starts, saves and grading. Unfinalized attempts hide keys and explanations. Historical scores use immutable snapshots. Leaderboards expose display names and aggregates to students, with separate administrator controls.
- Tests require an explicitly named, verified loopback test database and refuse production mode. Seed content is local-only and carries no test users into a release. Production migrations require target identity, backups, and history verification. Five checked-in migrations are preserved. An older local-only auth migration hash differs by a trailing newline.
- Secret scanning covers Git history and a copy of tracked release files with redacted output. Environment files and database dumps are ignored. CI credentials in the workflow are public, disposable PostgreSQL service values. No production URL or credential belongs in `VITE_*`.
- Auth rate limits are process-local. Reset responses use the same message for known and unknown email addresses. When mail is configured, provider call latency can differ. Before scale-out, consider destination-aware throttling and a durable delivery queue.

## Dependency audit disposition

Initial full and production-only audits each reported four HIGH package findings. Prisma CLI and `@prisma/config` 6.19.0 were flagged for the transitive packages below. Prisma is also an optional peer of the client, so the initial `--omit=dev` audit still reported the same chain.

| Initial package | Advisory | Reviewed resolution |
| --- | --- | --- |
| `deepmerge-ts@7.1.5` | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) | Override and lock to 8.0.0. |
| `effect@3.18.4` | [GHSA-38f7-945m-qr2g](https://github.com/advisories/GHSA-38f7-945m-qr2g), [GHSA-7589-6fvf-x4pw](https://github.com/advisories/GHSA-7589-6fvf-x4pw) | Override and lock to 3.22.1. |

Prisma and its client remain 6.19.0. Both final audits exited 0 and reported zero vulnerabilities. A clean workspace install, client generation, five-migration apply, status and regression tests passed with the overrides. npm 11.8.0's dependency listing initially flagged the upstream exact ranges. npm 11.21.3 recognized both as overrides and exited 0. Use the reviewed lockfile with `npm ci` and repeat both audits after dependency changes.
