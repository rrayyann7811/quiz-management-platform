import { z } from 'zod';
import { publicUser } from './auth.js';

export const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) return res.status(403).json({ message: 'Access denied for this role.' });
  next();
};

const id = z.uuid();
const studentFields = { ...publicUser, active: true, createdAt: true, archivedAt: true };

export function userRoutes(app, db, authenticate) {
  const admin = [authenticate, requireRole('ADMIN')];

  app.get('/api/admin/session', ...admin, (req, res) => res.json({ user: req.user }));
  app.get('/api/admin/dashboard', ...admin, async (_req, res) => {
    const [active, inactive, archived] = await db.$transaction([
      db.user.count({ where: { role: 'STUDENT', active: true } }),
      db.user.count({ where: { role: 'STUDENT', active: false, archivedAt: null } }),
      db.user.count({ where: { role: 'STUDENT', archivedAt: { not: null } } }),
    ], { isolationLevel: 'RepeatableRead' });
    res.json({ total: active + inactive + archived, active, inactive, archived });
  });

  app.get('/api/users', ...admin, async (req, res) => {
    const { search, page } = z.object({
      search: z.string().trim().max(100).default(''),
      page: z.coerce.number().int().min(1).max(100000).default(1),
    }).parse(req.query);
    const where = {
      role: 'STUDENT',
      ...(search && { OR: ['name', 'email'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }),
    };
    const [users, total] = await db.$transaction([
      db.user.findMany({ where, select: studentFields, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 }),
      db.user.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    res.json({ users, total, page, pageSize: 25 });
  });

  app.get('/api/users/:id', ...admin, async (req, res) => {
    const user = await db.user.findUnique({ where: { id: id.parse(req.params.id), role: 'STUDENT' }, select: studentFields });
    if (!user) return res.status(404).json({ message: 'Student not found.' });
    res.json({ user });
  });

  app.get('/api/users/:id/attempts', ...admin, async (req, res) => {
    const userId = id.parse(req.params.id);
    const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
    const pageSize = 25;
    const [student, attempts, total] = await db.$transaction([
      db.user.findUnique({ where: { id: userId, role: 'STUDENT' }, select: { id: true } }),
      db.attempt.findMany({ where: { userId }, orderBy: [{ finalizedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize, take: pageSize }),
      db.attempt.count({ where: { userId } }),
    ], { isolationLevel: 'RepeatableRead' });
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    res.json({ attempts: attempts.map(({ id, quizTitle, startedAt, finalizedAt, score, passed }) =>
      ({ id, quizTitle, startedAt, finalizedAt, score: Number(score), passed })), total, page, pageSize });
  });

  app.patch('/api/users/:id/status', ...admin, async (req, res) => {
    const userId = id.parse(req.params.id);
    const { active } = z.strictObject({ active: z.boolean() }).parse(req.body);
    const user = await db.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({ where: { id: userId, role: 'STUDENT', archivedAt: null }, data: { active } });
      if (!updated.count) {
        return tx.user.findUnique({ where: { id: userId, role: 'STUDENT' }, select: studentFields });
      }
      if (!active) {
        await tx.session.deleteMany({ where: { userId } });
        await tx.passwordReset.deleteMany({ where: { userId } });
      }
      return tx.user.findUnique({ where: { id: userId }, select: studentFields });
    });
    if (!user) return res.status(404).json({ message: 'Student not found.' });
    if (user.archivedAt) return res.status(409).json({ message: 'This student is archived.' });
    res.json({ user });
  });

  app.delete('/api/users/:id', ...admin, async (req, res) => {
    const userId = id.parse(req.params.id);
    const user = await db.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, role: 'STUDENT', archivedAt: null },
        data: { active: false, archivedAt: new Date() },
      });
      if (updated.count) {
        await tx.session.deleteMany({ where: { userId } });
        await tx.passwordReset.deleteMany({ where: { userId } });
      }
      return tx.user.findUnique({ where: { id: userId, role: 'STUDENT' }, select: studentFields });
    });
    if (!user) return res.status(404).json({ message: 'Student not found.' });
    res.json({ user });
  });
}
