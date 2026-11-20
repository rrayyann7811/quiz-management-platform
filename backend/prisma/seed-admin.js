import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { email, name, password } from '../src/auth.js';

const input = z.strictObject({ email, name, password }).safeParse({
  email: process.env.ADMIN_EMAIL,
  name: process.env.ADMIN_NAME,
  password: process.env.ADMIN_PASSWORD,
});
if (!input.success) throw new Error('Set valid ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD.');
const db = new PrismaClient();
try {
  const { email: address, name: displayName, password: secret } = input.data;
  try {
    await db.user.create({
      data: { name: displayName, email: address, passwordHash: await bcrypt.hash(secret, 12), role: 'ADMIN' },
    });
    console.log('Administrator provisioned.');
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    const existing = await db.user.findUnique({ where: { email: address }, select: { role: true } });
    if (existing?.role !== 'ADMIN') throw new Error('Email belongs to a student account.');
    console.log('Administrator already exists.');
  }
} finally {
  await db.$disconnect();
}
