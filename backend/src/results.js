import { z } from 'zod';
import { ApiError } from './api-error.js';
import { requireRole } from './users.js';

const idSchema = z.uuid();
const byCompletion = [{ finalizedAt: 'desc' }, { id: 'desc' }];
const summaryFields = {
  id: true, quizTitle: true, finalizedAt: true, score: true, passed: true, elapsedSeconds: true, status: true,
};

function summary({ id, quizTitle, finalizedAt, score, passed, elapsedSeconds, status }) {
  return { id, quizTitle, finalizedAt, percentage: Number(score), passed, elapsedSeconds, status };
}

function result(attempt) {
  const { snapshot, answers, correctCount, incorrectCount, unansweredCount, maximumMarks, obtainedMarks } = attempt;
  const review = snapshot ? snapshot.questions.map((question, index) => {
    const selectedOptionId = answers[question.id] ?? null;
    const correctOptionId = question.options.find((option) => option.isCorrect).id;
    const status = !selectedOptionId ? 'UNANSWERED' : selectedOptionId === correctOptionId ? 'CORRECT' : 'INCORRECT';
    return {
      number: index + 1, text: question.text, explanation: question.explanation,
      options: question.options.map(({ id, text }) => ({ id, text })),
      selectedOptionId, correctOptionId, status, marks: question.marks,
      awardedMarks: status === 'CORRECT' ? question.marks : 0,
    };
  }) : null;
  return { ...summary(attempt), totalQuestions: review?.length ?? null, correctCount, incorrectCount,
    unansweredCount, maximumMarks, obtainedMarks, review };
}

export function resultRoutes(app, db, authenticate, { withStudent, lockAttempt, expire, clock, settleActive }) {
  const student = [authenticate, requireRole('STUDENT')];

  app.get('/api/attempts/:attemptId/result', ...student, async (req, res) => {
    const id = idSchema.parse(req.params.attemptId);
    const attempt = await withStudent(req, async (tx, userId) => {
      const current = await lockAttempt(tx, id, userId, { includeLegacy: true });
      return current.finalizedAt ? current : expire(tx, current, await clock(tx));
    });
    if (!attempt.finalizedAt) throw new ApiError(409, 'Submit this attempt before viewing its result.');
    res.json({ result: result(attempt) });
  });

  app.get('/api/admin/attempts/:attemptId/result', authenticate, requireRole('ADMIN'), async (req, res) => {
    const id = idSchema.parse(req.params.attemptId);
    const attempt = await db.attempt.findFirst({
      where: { id, finalizedAt: { not: null }, user: { role: 'STUDENT' } },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!attempt) throw new ApiError(404, 'Completed attempt not found.');
    res.json({ result: result(attempt), student: attempt.user });
  });

  app.get('/api/attempts', ...student, async (req, res) => {
    const { page, pageSize } = z.object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(10),
    }).parse(req.query);
    const data = await withStudent(req, async (tx, userId) => {
      await settleActive(tx, userId, { expiredOnly: true });
      const where = { userId, finalizedAt: { not: null } };
      const attempts = await tx.attempt.findMany({
        where, orderBy: byCompletion, skip: (page - 1) * pageSize, take: pageSize, select: summaryFields,
      });
      return { attempts: attempts.map(summary), total: await tx.attempt.count({ where }), page, pageSize };
    });
    res.json(data);
  });

  app.get('/api/student/dashboard', ...student, async (req, res) => {
    const dashboard = await withStudent(req, async (tx, userId) => {
      const activeAttempts = await settleActive(tx, userId);
      const [stats] = await tx.$queryRaw`
        SELECT COUNT(*)::int AS "totalAttempts",
               (COUNT(*) FILTER (WHERE passed))::int AS "passedAttempts",
               (COUNT(*) FILTER (WHERE NOT passed))::int AS "failedAttempts",
               ROUND(AVG(score), 2)::float8 AS "averageScore",
               MAX(score)::float8 AS "highestScore",
               COALESCE(SUM("correctCount" + "incorrectCount"), 0)::float8 AS "answeredQuestions",
               (COUNT(*) FILTER (WHERE "correctCount" IS NULL OR "incorrectCount" IS NULL))::int AS "missingQuestionCounts"
        FROM "Attempt" WHERE "userId" = ${userId}::uuid AND "finalizedAt" IS NOT NULL
      `;
      const recent = await tx.attempt.findMany({
        where: { userId, finalizedAt: { not: null } }, orderBy: byCompletion, take: 20, select: summaryFields,
      });
      return {
        stats, activeAttempts, recentAttempts: recent.slice(0, 5).map(summary),
        scoreTrend: recent.reverse().map(({ id, quizTitle, finalizedAt, score }) =>
          ({ id, quizTitle, finalizedAt, percentage: Number(score) })),
      };
    });
    res.json(dashboard);
  });
}
