import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { connectLocalTestDatabase } from '../testing/local-database.js';
import { createApp } from '../src/app.js';

test('authentication, role boundaries, password reset and archive preservation against PostgreSQL', async () => {
  const url = process.env.TEST_DATABASE_URL;
  const db = await connectLocalTestDatabase();
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
    const renewed = await request('/auth/login', { body: { ...credentials, password } });
    assert.equal(renewed.status, 200);
    const studentId = registered.data.user.id;
    const profile = '/users/' + studentId;
    const adminToken = privileged.data.token;
    const statusChange = (token, active) => request(profile + '/status', { token, method: 'PATCH', body: { active } });
    assert.equal((await request('/users', { token: renewed.data.token })).status, 403);
    assert.equal((await statusChange(renewed.data.token, false)).status, 403);
    assert.equal((await request('/users/invalid', { token: adminToken })).status, 400);
    assert.equal((await request('/users/' + privileged.data.user.id, { token: adminToken })).status, 404);
    const search = await request('/users?search=' + suffix.toUpperCase(), { token: adminToken });
    assert.equal(search.data.total, 1);
    assert.equal(search.data.users[0].id, studentId);
    const before = await request('/admin/dashboard', { token: adminToken });
    assert.equal((await statusChange(adminToken, false)).data.user.active, false);
    assert.equal((await request('/auth/me', { token: renewed.data.token })).status, 401);
    assert.equal((await request('/auth/login', { body: { ...credentials, password } })).status, 401);
    assert.equal((await request(profile, { token: adminToken })).data.user.active, false);
    const after = await request('/admin/dashboard', { token: adminToken });
    assert.equal(after.data.inactive, before.data.inactive + 1);
    assert.equal((await statusChange(adminToken, true)).data.user.active, true);
    assert.equal((await request('/auth/me', { token: renewed.data.token })).status, 401);
    const signedIn = await request('/auth/login', { body: { ...credentials, password } });
    assert.equal(signedIn.status, 200);
    const historyPath = profile + '/attempts';
    const archive = (token) => request(profile, { token, method: 'DELETE' });
    const empty = await request(historyPath, { token: adminToken });
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.data.attempts, []);
    const attempt = await db.attempt.create({ data: {
      userId: studentId, quizTitle: 'Test assessment',
      startedAt: new Date('2026-01-01T10:00:00Z'), finalizedAt: new Date('2026-01-01T10:10:00Z'),
      score: 83.25, passed: true,
    } });
    assert.equal((await request(historyPath, { token: signedIn.data.token })).status, 403);
    assert.equal((await archive(signedIn.data.token)).status, 403);
    assert.equal((await request('/users/' + privileged.data.user.id + '/attempts', { token: adminToken })).status, 404);
    const historyBefore = await request(historyPath, { token: adminToken });
    assert.equal(historyBefore.status, 200);
    assert.deepEqual(historyBefore.data, { attempts: [{
      id: attempt.id, quizTitle: 'Test assessment', startedAt: attempt.startedAt.toISOString(),
      finalizedAt: attempt.finalizedAt.toISOString(), score: 83.25, passed: true,
    }], total: 1, page: 1, pageSize: 25 });
    const secondPage = await request(historyPath + '?page=2', { token: adminToken });
    assert.equal(secondPage.status, 200);
    assert.deepEqual(secondPage.data.attempts, []);

    const archived = await archive(adminToken);
    assert.equal(archived.status, 200);
    assert.ok(archived.data.user.archivedAt);
    assert.equal(archived.data.user.active, false);
    assert.deepEqual((await archive(adminToken)).data, archived.data);
    assert.equal((await statusChange(adminToken, true)).status, 409);
    assert.equal((await request('/auth/me', { token: signedIn.data.token })).status, 401);
    assert.equal((await request('/auth/login', { body: { ...credentials, password } })).status, 401);
    const historyAfter = await request(historyPath, { token: adminToken });
    assert.equal(historyAfter.status, 200);
    assert.deepEqual(historyAfter.data, historyBefore.data);
    assert.deepEqual(await db.attempt.findUnique({ where: { id: attempt.id } }), attempt);
    await assert.rejects(db.user.delete({ where: { id: studentId } }), /Attempt_userId_fkey/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.attempt.deleteMany({ where: { user: { email: student.email } } });
    await db.user.deleteMany({ where: { email: { in: [student.email, admin.email] } } });
    await db.$disconnect();
  }
});
