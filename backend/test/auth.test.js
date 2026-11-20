import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';

test('authentication, role boundaries and password reset against PostgreSQL', async () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, 'Set TEST_DATABASE_URL to an isolated migrated test database.');
  const db = new PrismaClient({ datasourceUrl: url });
  const origin = 'http://localhost:5173';
  const delivered = [];
  const server = createApp({ db, origin, sendReset: async (...message) => delivered.push(message) }).listen(0, '127.0.0.1');
  const suffix = randomUUID();
  const student = { name: 'Test Student', email: `student-${suffix}@example.test`, password: 'test-only-password' };
  const admin = { email: `admin-${suffix}@example.test`, password: 'test-only-admin-password' };

  async function request(path, { body, token, method = body ? 'POST' : 'GET', requestOrigin = origin } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: { Origin: requestOrigin, ...(body && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: 'Bearer ' + token }) },
      body: body && JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, data: response.status === 204 ? null : await response.json() };
  }

  try {
    await once(server, 'listening');
    assert.equal((await request('/health')).status, 200);
    const foreign = await request('/health', { requestOrigin: 'https://unrelated.example' });
    assert.notEqual(foreign.headers.get('access-control-allow-origin'), 'https://unrelated.example');
    assert.equal((await request('/auth/register', { body: { ...student, role: 'ADMIN' } })).status, 400);
    const registered = await request('/auth/register', { body: student });
    assert.equal(registered.status, 201);
    assert.equal(registered.data.user.role, 'STUDENT');
    assert.equal((await request('/auth/register', { body: student })).status, 409);
    assert.equal((await request('/auth/me')).status, 401);
    const credentials = { email: student.email, password: student.password };
    const login = await request('/auth/login', { body: credentials });
    assert.equal(login.status, 200);
    const token = login.data.token;
    assert.equal((await request('/auth/me', { token })).data.user.id, registered.data.user.id);
    assert.equal((await request('/admin/session', { token })).status, 403);

    const seed = spawnSync(process.execPath, ['prisma/seed-admin.js'], {
      env: { ...process.env, DATABASE_URL: url, ADMIN_EMAIL: admin.email, ADMIN_NAME: 'Test Admin', ADMIN_PASSWORD: admin.password },
      encoding: 'utf8',
    });
    assert.equal(seed.status, 0, seed.stderr);
    const privileged = await request('/auth/login', { body: admin });
    assert.equal(privileged.status, 200);
    assert.equal((await request('/admin/session', { token: privileged.data.token })).status, 200);
    assert.equal((await request('/auth/logout', { method: 'POST', token })).status, 204);
    assert.equal((await request('/auth/me', { token })).status, 401);

    const session = (await request('/auth/login', { body: credentials })).data.token;
    const resetRequest = await request('/auth/forgot-password', { body: { email: student.email } });
    assert.equal(resetRequest.status, 202);
    assert.equal(delivered.length, 1);
    const [[recipient, resetToken]] = delivered;
    assert.equal(recipient, student.email);
    assert.ok(!JSON.stringify(resetRequest.data).includes(resetToken));
    const password = 'replacement-password';
    const concurrent = await Promise.all(Array.from({ length: 2 }, () =>
      request('/auth/reset-password', { body: { token: resetToken, password } })));
    assert.deepEqual(concurrent.map(({ status }) => status).sort(), [204, 400]);
    assert.equal((await request('/auth/me', { token: session })).status, 401);
    assert.equal((await request('/auth/login', { body: credentials })).status, 401);
    assert.equal((await request('/auth/login', { body: { ...credentials, password } })).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.user.deleteMany({ where: { email: { in: [student.email, admin.email] } } });
    await db.$disconnect();
  }
});
