import { z } from 'zod';
import { ApiError } from './api-error.js';
import { validatePublishableQuiz } from './authoring.js';
import { requireRole } from './users.js';

const idSchema = z.uuid();
const emptyBody = z.strictObject({});
const submitSchema = z.strictObject({ onlyIfExpired: z.boolean().default(false) });
const answerSchema = z.strictObject({ questionId: idSchema, optionId: idSchema });
const minute = 60_000;

async function databaseClock(tx) {
  const [{ now }] = await tx.$queryRaw`SELECT clock_timestamp() AS now`;
  return now;
}

function notFound() {
  return new ApiError(404, 'Attempt not found.');
}

async function lockStudent(tx, userId) {
  const [user] = await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid AND active AND role = 'STUDENT' FOR SHARE`;
  if (!user) throw new ApiError(401, 'Sign in to continue.');
}

async function lockAttempt(tx, id, userId) {
  const [row] = await tx.$queryRaw`
    SELECT id FROM "Attempt"
    WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid AND "status" IS NOT NULL FOR UPDATE
  `;
  if (!row) throw notFound();
  return tx.attempt.findUnique({ where: { id } });
}

async function publishedQuiz(tx, quizId) {
  const [row] = await tx.$queryRaw`
    SELECT id FROM "Quiz" WHERE id = ${quizId}::uuid AND status = 'PUBLISHED' AND "archivedAt" IS NULL FOR UPDATE
  `;
  if (!row) throw new ApiError(404, 'Quiz not found.');
  return tx.quiz.findUnique({ where: { id: quizId } });
}

function attemptView(attempt, now) {
  const { id, quizId, quizTitle, status, startedAt, expiresAt, finalizedAt, snapshot } = attempt;
  const metadata = { id, quizId, quizTitle, status, startedAt, expiresAt, serverNow: now };
  if (status === 'IN_PROGRESS') {
    return {
      ...metadata, answers: attempt.answers,
      questions: snapshot.questions.map(({ id, text, options }) => ({
        id, text, options: options.map(({ id, text }) => ({ id, text })),
      })),
    };
  }
  return {
    ...metadata, finalizedAt,
    summary: {
      totalQuestions: snapshot.questions.length, correctCount: attempt.correctCount,
      incorrectCount: attempt.incorrectCount, unansweredCount: attempt.unansweredCount,
      maximumMarks: attempt.maximumMarks, obtainedMarks: attempt.obtainedMarks,
      percentage: Number(attempt.score), passed: attempt.passed, elapsedSeconds: attempt.elapsedSeconds,
    },
  };
}

async function finalize(tx, attempt, now) {
  const timedOut = now >= attempt.expiresAt;
  const finalizedAt = timedOut ? attempt.expiresAt : now;
  let maximumMarks = 0;
  let obtainedMarks = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  for (const question of attempt.snapshot.questions) {
    maximumMarks += question.marks;
    const answer = attempt.answers[question.id];
    if (!answer) unansweredCount += 1;
    else if (question.options.some(({ id, isCorrect }) => id === answer && isCorrect)) {
      correctCount += 1;
      obtainedMarks += question.marks;
    } else incorrectCount += 1;
  }
  if (maximumMarks <= 0) throw new ApiError(422, 'This attempt has no available marks.');
  // Round percentage half up to two decimals with integer marks.
  const hundredths = Math.floor((obtainedMarks * 20_000 + maximumMarks) / (2 * maximumMarks));
  return tx.attempt.update({
    where: { id: attempt.id },
    data: {
      status: timedOut ? 'TIMED_OUT' : 'SUBMITTED', finalizedAt, maximumMarks, obtainedMarks,
      score: (hundredths / 100).toFixed(2), passed: hundredths >= attempt.snapshot.passingPercent * 100,
      correctCount, incorrectCount, unansweredCount,
      elapsedSeconds: Math.floor(Math.max(0, finalizedAt - attempt.startedAt) / 1000),
    },
  });
}

async function expire(tx, attempt, now) {
  if (attempt.status === 'IN_PROGRESS' && now >= attempt.expiresAt) return finalize(tx, attempt, now);
  return attempt;
}

async function eligibility(tx, quiz, userId, clock) {
  const active = await tx.attempt.findFirst({
    where: { quizId: quiz.id, userId, status: 'IN_PROGRESS' }, select: { id: true },
  });
  const remainingAttempts = Math.max(0, quiz.maxAttempts - await tx.attempt.count({ where: { quizId: quiz.id, userId } }));
  if (!active) return { remainingAttempts, activeAttempt: null };
  const attempt = await lockAttempt(tx, active.id, userId);
  const now = await clock(tx);
  const current = await expire(tx, attempt, now);
  return { remainingAttempts, activeAttempt: current.status === 'IN_PROGRESS' ? current : null, now };
}

export function attemptRoutes(app, db, authenticate, clock = databaseClock) {
  const student = [authenticate, requireRole('STUDENT')];

  function withStudent(req, action) {
    return db.$transaction(async (tx) => {
      await lockStudent(tx, req.user.id);
      return action(tx, req.user.id);
    });
  }

  app.get('/api/quizzes/:quizId/eligibility', ...student, async (req, res) => {
    const quizId = idSchema.parse(req.params.quizId);
    const data = await withStudent(req, async (tx, userId) => {
      const quiz = await publishedQuiz(tx, quizId);
      const state = await eligibility(tx, quiz, userId, clock);
      return { remainingAttempts: state.remainingAttempts, activeAttemptId: state.activeAttempt?.id ?? null };
    });
    res.json(data);
  });

  app.post('/api/quizzes/:quizId/start', ...student, async (req, res) => {
    const quizId = idSchema.parse(req.params.quizId);
    emptyBody.parse(req.body ?? {});
    const { view, created } = await withStudent(req, async (tx, userId) => {
      const quiz = await publishedQuiz(tx, quizId);
      const { remainingAttempts, activeAttempt, now: checkedAt } = await eligibility(tx, quiz, userId, clock);
      if (activeAttempt) return { view: attemptView(activeAttempt, checkedAt), created: false };
      if (!remainingAttempts) return { view: null, created: false };

      const questions = await tx.question.findMany({
        where: { quizId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { options: { orderBy: { position: 'asc' } } },
      });
      validatePublishableQuiz({ ...quiz, questions });
      const snapshot = {
        categoryId: quiz.categoryId,
        passingPercent: quiz.passingPercent,
        questions: questions.map(({ id, text, marks, difficulty, explanation, options }) => ({
          id, text, marks, difficulty, explanation,
          options: options.map(({ id, text, isCorrect }) => ({ id, text, isCorrect })),
        })),
      };
      const now = await clock(tx);
      const attempt = await tx.attempt.create({
        data: {
          userId, quizId, quizTitle: quiz.title, startedAt: now, expiresAt: new Date(now.getTime() + quiz.durationMinutes * minute),
          snapshot, answers: {}, status: 'IN_PROGRESS',
        },
      });
      return { view: attemptView(attempt, now), created: true };
    });
    if (!view) throw new ApiError(409, 'You have used all allowed attempts.');
    res.status(created ? 201 : 200).json({ attempt: view });
  });

  app.get('/api/attempts/active', ...student, async (req, res) => {
    const attempts = await withStudent(req, async (tx, userId) => {
      const rows = await tx.attempt.findMany({
        where: { userId, status: 'IN_PROGRESS' }, orderBy: { id: 'asc' }, select: { id: true },
      });
      const active = [];
      for (const row of rows) {
        const attempt = await lockAttempt(tx, row.id, userId);
        const current = await expire(tx, attempt, await clock(tx));
        if (current.status === 'IN_PROGRESS') {
          active.push({ id: current.id, quizTitle: current.quizTitle, expiresAt: current.expiresAt });
        }
      }
      return active;
    });
    res.json({ attempts });
  });

  app.get('/api/attempts/:attemptId', ...student, async (req, res) => {
    const id = idSchema.parse(req.params.attemptId);
    const attempt = await withStudent(req, async (tx, userId) => {
      const attempt = await lockAttempt(tx, id, userId);
      const now = await clock(tx);
      return attemptView(await expire(tx, attempt, now), now);
    });
    res.json({ attempt });
  });

  app.put('/api/attempts/:attemptId/answers', ...student, async (req, res) => {
    const id = idSchema.parse(req.params.attemptId);
    const { questionId, optionId } = answerSchema.parse(req.body);
    const saved = await withStudent(req, async (tx, userId) => {
      const attempt = await lockAttempt(tx, id, userId);
      const question = attempt.snapshot.questions.find(({ id }) => id === questionId);
      const now = await clock(tx);
      const current = await expire(tx, attempt, now);
      if (current.status !== 'IN_PROGRESS') return false;
      if (!question?.options.some(({ id }) => id === optionId)) {
        throw new ApiError(400, 'Select an option that belongs to this question.');
      }
      await tx.attempt.update({ where: { id }, data: { answers: { ...current.answers, [questionId]: optionId } } });
      return true;
    });
    if (!saved) throw new ApiError(409, 'This attempt is already finalized.');
    res.json({ questionId, optionId });
  });

  app.post('/api/attempts/:attemptId/submit', ...student, async (req, res) => {
    const id = idSchema.parse(req.params.attemptId);
    const { onlyIfExpired } = submitSchema.parse(req.body ?? {});
    const attempt = await withStudent(req, async (tx, userId) => {
      const current = await lockAttempt(tx, id, userId);
      const now = await clock(tx);
      const settled = onlyIfExpired ? await expire(tx, current, now)
        : current.status === 'IN_PROGRESS' ? await finalize(tx, current, now) : current;
      return attemptView(settled, now);
    });
    res.json({ attempt });
  });
}
