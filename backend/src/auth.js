import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email().max(254);
export const name = z.string().trim().min(2).max(100);
export const password = z.string().min(12).refine(
  (value) => Buffer.byteLength(value) <= 72, 'Use at most 72 UTF-8 bytes.',
);
export const publicUser = { id: true, name: true, email: true, role: true };
const token = z.string().regex(/^[a-f0-9]{64}$/);
const issueToken = () => randomBytes(32).toString('hex');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const dummyHash = await bcrypt.hash(issueToken(), 12);

export function authRoutes(app, db, sendReset, limiter) {
  const authenticate = async (req, res, next) => {
    const parsed = token.safeParse(req.get('authorization')?.match(/^Bearer (.+)$/)?.[1]);
    if (!parsed.success) return res.status(401).json({ message: 'Sign in to continue.' });
    const session = await db.session.findUnique({
      where: { digest: digest(parsed.data) },
      include: { user: { select: { ...publicUser, active: true } } },
    });
    if (!session?.user.active || session.expiresAt <= new Date()) {
      return res.status(401).json({ message: 'Sign in to continue.' });
    }
    const { active, ...user } = session.user;
    req.user = user;
    req.sessionDigest = session.digest;
    next();
  };

  app.post('/api/auth/register', limiter, async (req, res) => {
    const input = z.strictObject({ name, email, password }).parse(req.body);
    try {
      const user = await db.user.create({
        data: { name: input.name, email: input.email, passwordHash: await bcrypt.hash(input.password, 12) },
        select: publicUser,
      });
      res.status(201).json({ user });
    } catch (error) {
      if (error.code !== 'P2002') throw error;
      res.status(409).json({ message: 'This email is already registered.' });
    }
  });

  app.post('/api/auth/login', limiter, async (req, res) => {
    const input = z.strictObject({ email, password }).parse(req.body);
    const user = await db.user.findUnique({ where: { email: input.email } });
    const valid = await bcrypt.compare(input.password, user?.passwordHash ?? dummyHash);
    if (!valid || !user?.active) return res.status(401).json({ message: 'Invalid email or password.' });
    const value = issueToken();
    const session = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`SELECT "passwordHash", active FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
      if (!locked[0]?.active || locked[0].passwordHash !== user.passwordHash) return null;
      await tx.session.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } });
      return tx.session.create({
        data: { digest: digest(value), userId: user.id, expiresAt: new Date(Date.now() + 8 * 60 * 60_000) },
      });
    });
    if (!session) return res.status(401).json({ message: 'Invalid email or password.' });
    const { id, name: displayName, email: address, role } = user;
    res.json({ token: value, user: { id, name: displayName, email: address, role } });
  });

  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));
  app.post('/api/auth/logout', authenticate, async (req, res) => {
    await db.session.deleteMany({ where: { digest: req.sessionDigest } });
    res.sendStatus(204);
  });

  const resetUnavailable = 'Email-based password reset is temporarily unavailable.';

  app.get('/api/auth/password-reset-status', (_req, res) => {
    res.json({ available: Boolean(sendReset) });
  });

  app.post('/api/auth/forgot-password', limiter, async (req, res) => {
    if (!sendReset) return res.status(503).json({ message: resetUnavailable });
    const input = z.strictObject({ email }).parse(req.body);
    const user = await db.user.findUnique({ where: { email: input.email } });
    if (user?.active) {
      const value = issueToken();
      const issued = await db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw`SELECT active FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
        if (!locked[0]?.active) return false;
        await tx.passwordReset.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } });
        await tx.passwordReset.create({
          data: { digest: digest(value), userId: user.id, expiresAt: new Date(Date.now() + 30 * 60_000) },
        });
        return true;
      });
      if (issued) {
        try {
          await sendReset(user.email, value);
        } catch {
          console.error('Password reset email delivery failed.');
        }
      }
    }
    res.status(202).json({ message: 'If the account can receive a reset email, check your inbox.' });
  });

  app.post('/api/auth/reset-password', limiter, async (req, res) => {
    const input = z.strictObject({ token, password }).parse(req.body);
    const key = digest(input.token);
    const reset = await db.passwordReset.findUnique({ where: { digest: key } });
    if (!reset || reset.expiresAt <= new Date()) {
      return res.status(400).json({ message: 'This reset link is invalid or expired.' });
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const changed = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`SELECT active FROM "User" WHERE id = ${reset.userId}::uuid FOR UPDATE`;
      if (!locked[0]?.active) return false;
      const consumed = await tx.passwordReset.deleteMany({ where: { digest: key, expiresAt: { gt: new Date() } } });
      if (!consumed.count) return false;
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.passwordReset.deleteMany({ where: { userId: reset.userId } });
      await tx.session.deleteMany({ where: { userId: reset.userId } });
      return true;
    });
    if (!changed) return res.status(400).json({ message: 'This reset link is invalid or expired.' });
    res.sendStatus(204);
  });

  return authenticate;
}
