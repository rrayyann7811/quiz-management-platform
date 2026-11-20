import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

export async function connectLocalTestDatabase() {
  assert.notEqual(process.env.NODE_ENV, 'production', 'Integration fixture writes are disabled in production mode.');
  const connection = new URL(process.env.TEST_DATABASE_URL ?? 'invalid:');
  const database = connection.pathname.slice(1);
  const loopback = ['127.0.0.1', '::1'];
  assert.ok(
    ['postgresql:', 'postgres:'].includes(connection.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname)
      && /^quiz_platform(?:_[a-z0-9]+)*_test$/.test(database) && !connection.search && !connection.hash,
    'TEST_DATABASE_URL must point to a dedicated local quiz_platform*_test PostgreSQL database.',
  );
  const db = new PrismaClient({ datasourceUrl: connection.href });
  try {
    const [{ name, address }] = await db.$queryRaw`SELECT current_database() AS name, host(inet_server_addr()) AS address`;
    assert.equal(name, database);
    assert.ok(loopback.includes(address), 'PostgreSQL must report a loopback server address.');
    return db;
  } catch (error) {
    await db.$disconnect();
    throw error;
  }
}
