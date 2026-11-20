import { z } from 'zod';
import { requireRole } from './users.js';

const uuid = z.uuid();
const difficulty = z.enum(['EASY', 'MEDIUM', 'HARD']);
const categoryFields = z.strictObject({ name: z.string().trim().min(2).max(80) });
const quizFields = z.strictObject({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(2000),
  categoryId: uuid,
  difficulty,
  durationMinutes: z.number().int().min(1).max(240),
  passingPercent: z.number().int().min(0).max(100),
  maxAttempts: z.number().int().min(1).max(20),
  thumbnailUrl: z.url({ protocol: /^https?$/ }).max(2048).nullable().default(null),
});

const questionFields = z.strictObject({
  text: z.string().trim().min(1).max(1000),
  explanation: z.string().trim().min(1).max(1500),
  marks: z.number().int().min(1).max(100),
  difficulty,
  options: z.array(z.strictObject({
    text: z.string().trim().min(1).max(350),
    isCorrect: z.boolean(),
  })).min(2).max(6).refine((options) => options.filter((option) => option.isCorrect).length === 1,
    'Choose exactly one correct option.'),
});

const quizSelect = {
  id: true, title: true, description: true, categoryId: true,
  category: { select: { id: true, name: true } },
  difficulty: true, durationMinutes: true, passingPercent: true, maxAttempts: true,
  status: true, thumbnailUrl: true, createdAt: true, updatedAt: true,
  _count: { select: { questions: true } },
};
const questionInclude = { options: { orderBy: { position: 'asc' } } };

export class AuthoringError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function missing(resource) {
  return new AuthoringError(404, resource + ' not found.');
}

async function lockQuiz(tx, id, editable = false) {
  const [quiz] = await tx.$queryRaw`SELECT id, status FROM "Quiz" WHERE id = ${id}::uuid AND "archivedAt" IS NULL FOR UPDATE`;
  if (!quiz) throw missing('Quiz');
  if (editable && quiz.status === 'PUBLISHED') throw new AuthoringError(409, 'Unpublish the quiz before editing it.');
  return quiz;
}

async function lockCategory(tx, id) {
  const [category] = await tx.$queryRaw`SELECT id FROM "Category" WHERE id = ${id}::uuid FOR UPDATE`;
  if (!category) throw missing('Category');
}

function visibleQuizzes(role, categoryId) {
  return {
    archivedAt: null,
    ...(categoryId && { categoryId }),
    ...(role === 'STUDENT' && { status: 'PUBLISHED' }),
  };
}

function quizList(db, role, categoryId) {
  return db.quiz.findMany({
    where: visibleQuizzes(role, categoryId), select: quizSelect,
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
  });
}

async function saveCategory(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error.code === 'P2002') throw new AuthoringError(409, 'A category with that name already exists.');
    if (error.code === 'P2025') throw missing('Category');
    throw error;
  }
}

export function authoringRoutes(app, db, authenticate) {
  const admin = [authenticate, requireRole('ADMIN')];

  app.get('/api/categories', authenticate, async (req, res) => {
    const where = req.user.role === 'STUDENT' ? { quizzes: { some: visibleQuizzes('STUDENT') } } : {};
    res.json({ categories: await db.category.findMany({ where, orderBy: { name: 'asc' } }) });
  });
  app.post('/api/categories', ...admin, async (req, res) => {
    const data = categoryFields.parse(req.body);
    const category = await saveCategory(() => db.category.create({ data }));
    res.status(201).json({ category });
  });
  app.patch('/api/categories/:id', ...admin, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const data = categoryFields.parse(req.body);
    const category = await saveCategory(() => db.category.update({ where: { id }, data }));
    res.json({ category });
  });
  app.get('/api/categories/:id', ...admin, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const category = await db.category.findUnique({ where: { id } });
    if (!category) throw missing('Category');
    res.json({ category, quizzes: await quizList(db, req.user.role, id) });
  });
  app.delete('/api/categories/:id', ...admin, async (req, res) => {
    const id = uuid.parse(req.params.id);
    await db.$transaction(async (tx) => {
      await lockCategory(tx, id);
      if (await tx.quiz.count({ where: { categoryId: id } })) {
        throw new AuthoringError(409, 'This category is referenced by quizzes and cannot be deleted.');
      }
      await tx.category.delete({ where: { id } });
    });
    res.sendStatus(204);
  });

  app.get('/api/quizzes', authenticate, async (req, res) => {
    const categoryId = uuid.optional().parse(req.query.categoryId);
    res.json({ quizzes: await quizList(db, req.user.role, categoryId) });
  });
  app.get('/api/quizzes/:id', authenticate, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const quiz = await db.quiz.findFirst({ where: { id, ...visibleQuizzes(req.user.role) }, select: quizSelect });
    if (!quiz) throw missing('Quiz');
    res.json({ quiz });
  });
  app.post('/api/quizzes', ...admin, async (req, res) => {
    const data = quizFields.parse(req.body);
    const quiz = await db.$transaction(async (tx) => {
      await lockCategory(tx, data.categoryId);
      return tx.quiz.create({ data, select: quizSelect });
    });
    res.status(201).json({ quiz });
  });
  app.patch('/api/quizzes/:id', ...admin, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const data = quizFields.parse(req.body);
    const quiz = await db.$transaction(async (tx) => {
      await lockCategory(tx, data.categoryId);
      await lockQuiz(tx, id, true);
      return tx.quiz.update({ where: { id }, data, select: quizSelect });
    });
    res.json({ quiz });
  });
  app.delete('/api/quizzes/:id', ...admin, async (req, res) => {
    const id = uuid.parse(req.params.id);
    await db.$transaction(async (tx) => {
      await lockQuiz(tx, id);
      await tx.quiz.update({ where: { id }, data: { archivedAt: new Date(), status: 'UNPUBLISHED' } });
    });
    res.sendStatus(204);
  });

  app.post('/api/quizzes/:id/publish', ...admin, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { published } = z.strictObject({ published: z.boolean() }).parse(req.body);
    const quiz = await db.$transaction(async (tx) => {
      await lockQuiz(tx, id);
      if (published) {
        const candidate = await tx.quiz.findUnique({ where: { id },
          include: { questions: { include: questionInclude } } });
        const { durationMinutes, passingPercent, maxAttempts, questions } = candidate;
        if (durationMinutes < 1 || durationMinutes > 240 || passingPercent < 0 || passingPercent > 100
          || maxAttempts < 1 || maxAttempts > 20) {
          throw new AuthoringError(422, 'Set a valid duration, passing percentage, and attempt limit.');
        }
        if (!questions.length) throw new AuthoringError(422, 'Add at least one question before publishing.');
        const invalidQuestion = questions.some(({ marks, options }) => marks < 1 || marks > 100
          || options.length < 2 || options.length > 6 || options.filter(({ isCorrect }) => isCorrect).length !== 1);
        if (invalidQuestion) throw new AuthoringError(422, 'Every question needs positive marks, 2–6 options, and exactly one correct answer.');
      }
      return tx.quiz.update({ where: { id },
        data: { status: published ? 'PUBLISHED' : 'UNPUBLISHED' }, select: quizSelect });
    });
    res.json({ quiz });
  });

  app.get('/api/quizzes/:quizId/questions', ...admin, async (req, res) => {
    const id = uuid.parse(req.params.quizId);
    const quiz = await db.quiz.findFirst({
      where: { id, archivedAt: null },
      select: { questions: { include: questionInclude, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!quiz) throw missing('Quiz');
    res.json({ questions: quiz.questions });
  });
  app.post('/api/quizzes/:quizId/questions', ...admin, async (req, res) => {
    const quizId = uuid.parse(req.params.quizId);
    const { options, ...fields } = questionFields.parse(req.body);
    const question = await db.$transaction(async (tx) => {
      await lockQuiz(tx, quizId, true);
      return tx.question.create({
        data: { ...fields, quizId, options: { create: options.map((option, position) => ({ ...option, position })) } },
        include: questionInclude,
      });
    });
    res.status(201).json({ question });
  });

  app.get('/api/questions/:id', ...admin, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const question = await db.question.findFirst({
      where: { id, quiz: { archivedAt: null } }, include: questionInclude,
    });
    if (!question) throw missing('Question');
    res.json({ question });
  });

  app.patch('/api/questions/:id', ...admin, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { options, ...data } = questionFields.parse(req.body);
    const question = await db.$transaction(async (tx) => {
      const current = await tx.question.findUnique({ where: { id }, select: { quizId: true } });
      if (!current) throw missing('Question');
      await lockQuiz(tx, current.quizId, true);
      const updated = await tx.question.updateMany({ where: { id }, data });
      if (!updated.count) throw missing('Question');
      await tx.option.deleteMany({ where: { questionId: id } });
      await tx.option.createMany({ data: options.map((option, position) => ({ ...option, position, questionId: id })) });
      return tx.question.findUnique({ where: { id }, include: questionInclude });
    });
    res.json({ question });
  });

  app.delete('/api/questions/:id', ...admin, async (req, res) => {
    const id = uuid.parse(req.params.id);
    await db.$transaction(async (tx) => {
      const question = await tx.question.findUnique({ where: { id }, select: { quizId: true } });
      if (!question) throw missing('Question');
      await lockQuiz(tx, question.quizId, true);
      const deleted = await tx.question.deleteMany({ where: { id } });
      if (!deleted.count) throw missing('Question');
    });
    res.sendStatus(204);
  });
}
