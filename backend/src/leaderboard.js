import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from './api-error.js';
import { requireRole } from './users.js';

const uuid = z.uuid();
const pagination = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
};
const filters = z.strictObject({
  ...pagination, categoryId: uuid.optional(), period: z.enum(['overall', 'weekly', 'monthly']).default('overall'),
});

function periodFilter(period) {
  const periodUnit = { weekly: 'week', monthly: 'month' }[period];
  if (!periodUnit) return Prisma.empty;
  return Prisma.sql`AND a."finalizedAt" >= date_trunc(${periodUnit}, CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    AND a."finalizedAt" <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`;
}

export function leaderboardRoutes(app, db, authenticate) {
  const admin = [authenticate, requireRole('ADMIN')];

  app.get('/api/leaderboard/categories', authenticate, async (_req, res) => {
    const categories = await db.$queryRaw`
      WITH historic AS (
        SELECT DISTINCT "snapshot"->>'categoryId' AS id FROM "Attempt"
        WHERE "quizId" IS NOT NULL AND "finalizedAt" IS NOT NULL AND "snapshot"->>'categoryId' IS NOT NULL
      )
      SELECT COALESCE(c.id::text, historic.id) AS id, COALESCE(c.name,
        'Unavailable category (' || left(historic.id, 8) || ')') AS name
      FROM "Category" c FULL JOIN historic ON c.id::text = historic.id ORDER BY name, id
    `;
    res.json({ categories });
  });

  app.get('/api/leaderboard', authenticate, async (req, res) => {
    const { categoryId, period, page, limit } = filters.parse(req.query);
    const scope = categoryId ? Prisma.sql`AND a."snapshot"->>'categoryId' = ${categoryId}` : Prisma.empty;
    const rows = await db.$queryRaw`
      WITH best_per_quiz AS (
        SELECT a."userId", a."quizId", MAX(a.score) AS best
        FROM "Attempt" a JOIN "User" u ON u.id = a."userId"
        WHERE a."quizId" IS NOT NULL AND a."finalizedAt" IS NOT NULL AND a.score IS NOT NULL
          AND u.role = 'STUDENT' AND u.active AND u."archivedAt" IS NULL AND NOT u."leaderboardExcluded"
          ${scope} ${periodFilter(period)}
        GROUP BY a."userId", a."quizId"
      ), scores AS (
        SELECT "userId", ROUND(AVG(best), 2) AS average, COUNT(*)::int AS completed, MAX(best) AS highest
        FROM best_per_quiz GROUP BY "userId"
      ), ranked AS (
        SELECT *, RANK() OVER (ORDER BY average DESC, completed DESC, highest DESC)::int AS rank FROM scores
      )
      SELECT ranked.rank, u.name AS "displayName", ranked.average::float8 AS "averageScore",
        ranked.highest::float8 AS "highestScore", ranked.completed AS "quizzesCompleted"
        ${req.user.role === 'ADMIN' ? Prisma.sql`, u.id AS "studentId"` : Prisma.empty}
      FROM ranked JOIN "User" u ON ranked."userId" = u.id
      ORDER BY ranked.rank, lower(u.name) COLLATE "C", u.id
      LIMIT ${limit + 1} OFFSET ${(page - 1) * limit}
    `;
    res.json({ entries: rows.slice(0, limit), categoryId: categoryId ?? null, period, page, limit, hasMore: rows.length > limit });
  });

  app.get('/api/admin/leaderboard/exclusions', ...admin, async (req, res) => {
    const { page, limit } = z.strictObject(pagination).parse(req.query);
    const students = await db.user.findMany({
      where: { role: 'STUDENT', leaderboardExcluded: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }], take: limit + 1, skip: (page - 1) * limit,
      select: { id: true, name: true, active: true, archivedAt: true },
    });
    res.json({ students: students.slice(0, limit), page, limit, hasMore: students.length > limit });
  });

  app.patch('/api/admin/leaderboard/exclusions/:id', ...admin, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { excluded } = z.strictObject({ excluded: z.boolean() }).parse(req.body);
    const updated = await db.user.updateMany({
      where: { id, role: 'STUDENT' }, data: { leaderboardExcluded: excluded },
    });
    if (!updated.count) throw new ApiError(404, 'Student not found.');
    res.json({ id, excluded });
  });
}
