# Deployment notes

The planned targets are Vercel, Render and Neon. Verify current plan limits, commands, routing and production migration settings during Day 7. Prompt 4 owner approval is required before repository or deployment operations.

| Component | Environment | Value |
| --- | --- | --- |
| Frontend | VITE_API_URL | Public API base URL including /api. |
| API | DATABASE_URL | PostgreSQL connection string, supplied as a secret. |
| API | FRONTEND_ORIGIN | Exact frontend origin, without a trailing slash. |
| API | PORT | Listener port provided by the host. Local default is 4000. |
| API | TRUST_PROXY_HOPS | Set only to the verified trusted proxy hop count. Local default is 0. |
| API | RESEND_API_KEY and RESET_FROM | Optional email configuration, set together. |
| Owner provisioning | ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD | Temporary inputs for the administrator CLI. |

## Password-reset delivery

1. Add a sending domain in Resend. Publish the DNS records shown by Resend and wait for verification. [Resend domain documentation](https://resend.com/docs/dashboard/domains/introduction)
2. Create a Sending access API key restricted to that domain and set it as the API's `RESEND_API_KEY`. Set `RESET_FROM` to an address on the verified domain, such as `Assessments <assessments@example.com>` using your domain. [Resend API key permissions](https://resend.com/changelog/new-api-key-permissions)
3. Set `FRONTEND_ORIGIN` to the actual frontend origin and restart the API. Request a reset from the app for a registered account, confirm the email arrives, open its link and sign in with the new password.

Delivery status: NOT VERIFIED. Integration tests cover issuance and consumption with a test mail callback. No Resend sender or credentials were configured.
