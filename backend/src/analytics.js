import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from './api-error.js';
import { platformStatistics } from './platform-statistics.js';
import { requireRole } from './users.js';

const day = 86_400_000;
const date = z.iso.date();
const page = z.coerce.number().int().min(1).max(100000).default(1);
const filters = z.strictObject({
  from: date.optional(), to: date.optional(), group: z.enum(['day', 'week', 'month']).default('day'),
  limit: z.coerce.number().int().min(1).max(50).default(10), quizPage: page, categoryPage: page,
});

function range(query) {
  const today = new Date().toISOString().slice(0, 10);
  const to = query.to ?? today;
  const from = query.from ?? new Date(Date.parse(to) - 29 * day).toISOString().slice(0, 10);
  const days = (Date.parse(to) - Date.parse(from)) / day + 1;
  if (from < '0001-01-01' || days < 1 || days > 366) throw new ApiError(400, 'Select a date range of 1–366 days.');
  return { ...query, from, to };
}

function dates({ from, to }) {
  return Prisma.sql`SELECT ${from}::date::timestamp AS since, (${to}::date + 1)::timestamp AS until`;
}

async function trends(db, window) {
  const { group } = window;
  const interval = { day: '1 day', week: '1 week', month: '1 month' }[group];
  return db.$queryRaw`
    WITH bounds AS (${dates(window)}), starts AS (
      SELECT date_trunc(${group}, a."startedAt") AS bucket, COUNT(*)::int AS total
      FROM "Attempt" a CROSS JOIN bounds WHERE a."startedAt" >= since AND a."startedAt" < until GROUP BY 1
    ), registrations AS (
      SELECT date_trunc(${group}, u."createdAt") AS bucket, COUNT(*)::int AS total
      FROM "User" u CROSS JOIN bounds WHERE u.role = 'STUDENT' AND u."createdAt" >= since AND u."createdAt" < until GROUP BY 1
    )
    SELECT to_char(series.bucket, 'YYYY-MM-DD') AS date,
      COALESCE(starts.total, 0) AS attempts, COALESCE(registrations.total, 0) AS registrations
    FROM bounds
    CROSS JOIN LATERAL generate_series(date_trunc(${group}, since),
      date_trunc(${group}, until - interval '1 day'), ${interval}::interval) AS series(bucket)
    LEFT JOIN starts USING (bucket)
    LEFT JOIN registrations USING (bucket)
    ORDER BY series.bucket
  `;
}

function breakdown(window, identity) {
  return Prisma.sql`
    WITH bounds AS (${dates(window)}), counted AS (
      SELECT ${identity} AS key,
        (COUNT(*) FILTER (WHERE a."startedAt" >= since AND a."startedAt" < until))::int AS "totalAttempts",
        (COUNT(*) FILTER (WHERE a."finalizedAt" >= since AND a."finalizedAt" < until))::int AS "completedAttempts",
        ROUND(AVG(a.score) FILTER (WHERE a."finalizedAt" >= since AND a."finalizedAt" < until), 2)::float8 AS "averageScore",
        (MAX(a.score) FILTER (WHERE a."finalizedAt" >= since AND a."finalizedAt" < until))::float8 AS "highestScore",
        (COUNT(*) FILTER (WHERE a."finalizedAt" >= since AND a."finalizedAt" < until AND a.passed))::int AS "passedAttempts",
        (COUNT(*) FILTER (WHERE a."finalizedAt" >= since AND a."finalizedAt" < until AND NOT a.passed))::int AS "failedAttempts"
      FROM "Attempt" a CROSS JOIN bounds
      WHERE ${identity} IS NOT NULL AND (
        (a."startedAt" >= since AND a."startedAt" < until) OR (a."finalizedAt" >= since AND a."finalizedAt" < until)
      )
      GROUP BY 1
    )
  `;
}

const aggregateColumns = Prisma.sql`
  COALESCE("totalAttempts", 0) AS "totalAttempts", COALESCE("completedAttempts", 0) AS "completedAttempts",
  "averageScore", "highestScore", COALESCE("passedAttempts", 0) AS "passedAttempts",
  COALESCE("failedAttempts", 0) AS "failedAttempts",
  COALESCE(ROUND(100.0 * "passedAttempts" / NULLIF("completedAttempts", 0), 2), 0)::float8 AS "passPercentage"
`;

function quizzes(db, window, popular = false) {
  const filter = popular ? Prisma.sql`WHERE counted."totalAttempts" > 0`
    : Prisma.sql`WHERE q."archivedAt" IS NULL OR counted.key IS NOT NULL`;
  const order = popular ? Prisma.sql`counted."totalAttempts" DESC, q.title, q.id` : Prisma.sql`q.title, q.id`;
  return db.$queryRaw`
    ${breakdown(window, Prisma.sql`a."quizId"`)}
    SELECT q.id, q.title, c.name AS category, q."archivedAt" IS NOT NULL AS archived, ${aggregateColumns}
    FROM "Quiz" q
    JOIN "Category" c ON c.id = q."categoryId"
    LEFT JOIN counted ON counted.key = q.id
    ${filter}
    ORDER BY ${order}
    LIMIT ${popular ? window.limit : window.limit + 1} OFFSET ${popular ? 0 : (window.quizPage - 1) * window.limit}
  `;
}

function categories(db, window) {
  return db.$queryRaw`
    ${breakdown(window, Prisma.sql`a."snapshot"->>'categoryId'`)}, inventory AS (
      SELECT "categoryId" AS id, COUNT(*)::int AS "quizCount"
      FROM "Quiz" WHERE "archivedAt" IS NULL GROUP BY 1
    )
    SELECT COALESCE(c.id::text, counted.key) AS id, COALESCE(c.name, 'Unavailable category') AS name,
      COALESCE(inventory."quizCount", 0) AS "quizCount", ${aggregateColumns}
    FROM "Category" c FULL JOIN counted ON c.id::text = counted.key
    LEFT JOIN inventory ON inventory.id = c.id
    ORDER BY name, id
    LIMIT ${window.limit + 1} OFFSET ${(window.categoryPage - 1) * window.limit}
  `;
}

async function passFail(db, window) {
  const [counts] = await db.$queryRaw`
    WITH bounds AS (${dates(window)})
    SELECT COUNT(*)::int AS "completedAttempts", (COUNT(*) FILTER (WHERE passed))::int AS "passedAttempts",
      (COUNT(*) FILTER (WHERE NOT passed))::int AS "failedAttempts",
      COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE passed) / NULLIF(COUNT(*), 0), 2), 0)::float8 AS "passPercentage",
      COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE NOT passed) / NULLIF(COUNT(*), 0), 2), 0)::float8 AS "failPercentage"
    FROM "Attempt" CROSS JOIN bounds WHERE "finalizedAt" >= since AND "finalizedAt" < until
  `;
  return counts;
}

export function analyticsRoutes(app, db, authenticate) {
  app.get('/api/admin/analytics', authenticate, requireRole('ADMIN'), async (req, res) => {
    const window = range(filters.parse(req.query));
    const data = await db.$transaction(async (tx) => {
      const platform = await platformStatistics(tx);
      const trend = await trends(tx, window);
      const outcomes = await passFail(tx, window);
      const quizPerformance = await quizzes(tx, window);
      const quizPopularity = await quizzes(tx, window, true);
      const categoryPerformance = await categories(tx, window);
      const paginate = (rows, page) => ({ rows: rows.slice(0, window.limit), page, hasMore: rows.length > window.limit });
      return {
        platform, attemptTrends: trend.map(({ date, attempts }) => ({ date, attempts })),
        studentRegistrations: trend.map(({ date, registrations }) => ({ date, registrations })),
        passFail: outcomes, quizPopularity,
        quizPerformance: paginate(quizPerformance, window.quizPage),
        categoryPerformance: paginate(categoryPerformance, window.categoryPage),
      };
    }, { isolationLevel: 'RepeatableRead' });
    res.json({ ...data, filters: window });
  });
}
