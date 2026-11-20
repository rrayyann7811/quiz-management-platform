import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';

const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
if (new URL(origin).origin !== origin) throw new Error('FRONTEND_ORIGIN must be an exact origin.');
const { RESEND_API_KEY: key, RESET_FROM: from } = process.env;
if (Boolean(key) !== Boolean(from)) throw new Error('Set both RESEND_API_KEY and RESET_FROM.');
const sendReset = key ? async (to, token) => {
  const link = new URL('/reset-password', origin);
  link.hash = new URLSearchParams({ token }).toString();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to, subject: 'Reset your assessment platform password',
      text: `Use this link within 30 minutes to reset your password:\n${link}\n\nIf you did not request this, ignore this email.`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Reset email failed.');
} : undefined;

const db = new PrismaClient();
await db.$connect();
const server = createApp({
  db, origin, sendReset, proxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
}).listen(Number(process.env.PORT ?? 4000), () => console.log('Quiz API listening'));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(async () => { await db.$disconnect(); }));
}
