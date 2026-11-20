import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';

const production = process.env.NODE_ENV === 'production';
const origin = process.env.FRONTEND_ORIGIN ?? (production ? '' : 'http://localhost:5173');
let frontend;
try {
  frontend = new URL(origin);
} catch {
  throw new Error('Set FRONTEND_ORIGIN to the exact frontend origin.');
}
if (frontend.origin !== origin || !['http:', 'https:'].includes(frontend.protocol)
  || (production && frontend.protocol !== 'https:')) {
  throw new Error('FRONTEND_ORIGIN must be an exact origin and use HTTPS in production.');
}
const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
if (!Number.isInteger(proxyHops) || proxyHops < 0) throw new Error('TRUST_PROXY_HOPS must be a nonnegative integer.');
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
  db, origin, sendReset, proxyHops,
}).listen(Number(process.env.PORT ?? 4000), production ? '0.0.0.0' : '127.0.0.1', () => console.log('Quiz API listening'));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(async () => { await db.$disconnect(); }));
}
