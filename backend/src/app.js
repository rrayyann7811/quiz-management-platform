import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { authRoutes } from './auth.js';
import { userRoutes } from './users.js';
import { authoringRoutes } from './authoring.js';
import { attemptRoutes } from './attempts.js';
import { ApiError } from './api-error.js';

export function createApp({ db, origin, proxyHops = 0, sendReset, attemptClock }) {
  const app = express();
  app.set('trust proxy', proxyHops);
  app.disable('x-powered-by');
  app.use(helmet(), cors({ origin }), express.json({ limit: '32kb' }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 240, message: { message: 'Too many requests.' } }));
  app.get('/api/health', async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  const authenticate = authRoutes(app, db, sendReset, rateLimit({
    windowMs: 15 * 60_000, limit: 30,
    message: { message: 'Too many authentication requests. Try again later.' },
  }));

  userRoutes(app, db, authenticate);
  authoringRoutes(app, db, authenticate);
  attemptRoutes(app, db, authenticate, attemptClock);
  app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }));
  app.use((error, _req, res, _next) => {
    if (error instanceof ApiError) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: error.issues[0].message,
        errors: error.issues.map(({ path, message }) => ({ field: path.join('.'), message })),
      });
    }
    if (error.status === 400 || error.status === 413) {
      return res.status(error.status).json({ message: 'Invalid request body.' });
    }
    console.error('Request failed', error.name);
    res.status(500).json({ message: 'Something went wrong.' });
  });
  return app;
}
