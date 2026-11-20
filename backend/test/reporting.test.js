import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { connectLocalTestDatabase } from '../testing/local-database.js';

async function fixture(t, reportingNow) {
  const db = await connectLocalTestDatabase();
  const server = createApp({ db, origin: 'http://localhost:5173', reportingNow }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const ids = { user: [], quiz: [], category: [] };
  const marker = randomUUID().slice(0, 8);
  t.after(async () => {
    try {
      await new Promise((resolve) => server.close(resolve));
      await db.attempt.deleteMany({ where: { userId: { in: ids.user } } });
      for (const model of ['quiz', 'category', 'user']) await db[model].deleteMany({ where: { id: { in: ids[model] } } });
    } finally {
      await db.$disconnect();
    }
  });

  async function account(name, fields = {}) {
    const token = randomBytes(32).toString('hex');
    const user = await db.user.create({ data: {
      name: name + ' ' + marker, email: randomUUID() + '@example.test', role: 'STUDENT', passwordHash: 'fixture-only',
      sessions: { create: { digest: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 600_000) } },
      ...fields,
    } });
    ids.user.push(user.id);
    return { ...user, token };
  }

  async function category(name) {
    const row = await db.category.create({ data: { name: name + ' ' + marker } });
    ids.category.push(row.id);
    return row;
  }

  async function quiz(title, categoryId, status, archivedAt = null) {
    const row = await db.quiz.create({ data: {
      title: title + ' ' + marker, description: 'Reporting fixture', categoryId, difficulty: 'EASY',
      durationMinutes: 2, passingPercent: 60, maxAttempts: 10, status, archivedAt,
      questions: { create: { text: 'What is one plus one?', explanation: 'One plus one is two.', marks: 1, difficulty: 'EASY' } },
    } });
    ids.quiz.push(row.id);
    return row;
  }

  async function attempt(user, quiz, categoryId, score, finalizedAt, { timedOut = false, startedAt } = {}) {
    const start = startedAt ?? new Date(finalizedAt.getTime() - 60_000);
    const end = new Date(start.getTime() + 120_000);
    return db.attempt.create({ data: {
      userId: user.id, quizId: quiz.id, quizTitle: quiz.title, startedAt: start, expiresAt: end, finalizedAt,
      status: score === null ? 'IN_PROGRESS' : timedOut ? 'TIMED_OUT' : 'SUBMITTED',
      snapshot: { categoryId }, answers: {},
      ...(score !== null && { score, passed: score >= 60, maximumMarks: 100, obtainedMarks: score,
        correctCount: score ? 1 : 0, incorrectCount: score ? 0 : 1, unansweredCount: 0,
        elapsedSeconds: timedOut ? 120 : 60 }),
    } });
  }

  async function request(path, account, status = 200, body) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api' + path, {
      method: body ? 'PATCH' : 'GET',
      headers: { ...(account && { Authorization: 'Bearer ' + account.token }), ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, status, path + ' ' + JSON.stringify(data));
    return data;
  }

  return { db, account, category, quiz, attempt, request };
}

const date = (day, time = '12:00:00') => new Date(`2004-01-${day}T${time}Z`);

test('platform analytics uses persisted scores, UTC buckets, and historical categories', async (t) => {
  const { db, account, category, quiz, attempt, request } = await fixture(t);
  const admin = await account('Analytics Admin', { role: 'ADMIN', createdAt: date('02') });
  const baseline = await request('/admin/dashboard', admin);
  const alpha = await account('Active', { createdAt: date('02') });
  const beta = await account('Inactive', { active: false, createdAt: date('05') });
  await account('Archived', { active: false, archivedAt: date('05'), createdAt: date('05') });
  const oldCategory = await category('Analytic source');
  const currentCategory = await category('Analytic destination');
  const archived = await quiz('Analytic archived', currentCategory.id, 'UNPUBLISHED', date('05'));
  const published = await quiz('Analytic published', currentCategory.id, 'PUBLISHED');
  await quiz('Analytic draft', currentCategory.id, 'DRAFT');
  await quiz('Analytic unpublished', currentCategory.id, 'UNPUBLISHED');
  await attempt(alpha, archived, oldCategory.id, 80, date('02'));
  await attempt(alpha, archived, oldCategory.id, 60, date('02', '12:05:00'), { startedAt: date('02', '12:03:00'), timedOut: true });
  await attempt(beta, published, currentCategory.id, 20, date('05'));
  await attempt(alpha, published, currentCategory.id, null, null, { startedAt: date('05', '23:59:59') });
  await db.attempt.create({ data: {
    userId: alpha.id, quizTitle: 'Legacy', startedAt: date('05', '00:00:00'), finalizedAt: date('05', '00:01:00'),
    score: 40, passed: false,
  } });
  const dashboard = await request('/admin/dashboard', admin);
  for (const [field, increase] of Object.entries({
    totalStudents: 3, activeStudents: 1, inactiveStudents: 1, archivedStudents: 1, totalQuizzes: 3,
    publishedQuizzes: 1, draftQuizzes: 1, unpublishedQuizzes: 1, totalQuestions: 3, totalAttempts: 5,
    completedAttempts: 4, passedAttempts: 2, failedAttempts: 2,
  })) assert.equal(dashboard[field], baseline[field] + increase, field);
  if (baseline.completedAttempts === 0) assert.equal(dashboard.averageScore, 50);

  const path = '/admin/analytics?from=2004-01-02&to=2004-01-05&limit=50';
  await request(path, alpha, 403);
  await request(path, null, 401);
  for (const invalid of ['group=year', 'limit=51', 'from=2020-01-01&to=2024-01-01', 'from=2024-02-31', 'foo=1', 'quizPage=0']) {
    await request('/admin/analytics?' + invalid, admin, 400);
  }
  const analytics = await request(path, admin);
  assert.equal(analytics.platform.totalAttempts, dashboard.totalAttempts);
  assert.deepEqual(analytics.attemptTrends.map(({ attempts }) => attempts), [2, 0, 0, 3]);
  assert.deepEqual(analytics.studentRegistrations.map(({ registrations }) => registrations), [1, 0, 0, 2]);
  assert.deepEqual(analytics.passFail, { completedAttempts: 4, passedAttempts: 2, failedAttempts: 2, passPercentage: 50, failPercentage: 50 });
  assert.deepEqual((await request(path + '&group=week', admin)).attemptTrends, [
    { date: '2003-12-29', attempts: 2 }, { date: '2004-01-05', attempts: 3 },
  ]);
  assert.deepEqual((await request(path + '&group=month', admin)).attemptTrends, [{ date: '2004-01-01', attempts: 5 }]);
  assert.deepEqual(analytics.quizPopularity.map(({ id, totalAttempts, completedAttempts }) => [id, totalAttempts, completedAttempts]),
    [[archived.id, 2, 2], [published.id, 2, 1]]);
  const row = analytics.quizPerformance.rows.find(({ id }) => id === archived.id);
  assert.deepEqual([row.archived, row.category, row.averageScore, row.highestScore, row.passedAttempts, row.passPercentage],
    [true, currentCategory.name, 70, 80, 2, 100]);
  assert.ok(analytics.quizPerformance.rows.some(({ averageScore, completedAttempts }) => averageScore === null && completedAttempts === 0));
  const original = analytics.categoryPerformance.rows.find(({ id }) => id === oldCategory.id);
  const current = analytics.categoryPerformance.rows.find(({ id }) => id === currentCategory.id);
  assert.deepEqual([original.quizCount, original.totalAttempts, original.completedAttempts, original.averageScore, original.passPercentage],
    [0, 2, 2, 70, 100]);
  assert.deepEqual([current.quizCount, current.totalAttempts, current.completedAttempts, current.averageScore, current.passPercentage],
    [3, 2, 1, 20, 0]);
  await db.category.delete({ where: { id: oldCategory.id } });
  const retained = (await request(path, admin)).categoryPerformance.rows.find(({ id }) => id === oldCategory.id);
  assert.deepEqual([retained.name, retained.totalAttempts, retained.completedAttempts, retained.averageScore],
    ['Unavailable category', 2, 2, 70]);
  const empty = await request('/admin/analytics?from=2005-01-01&to=2005-01-02&limit=1', admin);
  assert.ok(empty.attemptTrends.every(({ attempts }) => attempts === 0));
  assert.deepEqual(empty.quizPopularity, []);
  assert.deepEqual(empty.passFail, { completedAttempts: 0, passedAttempts: 0, failedAttempts: 0, passPercentage: 0, failPercentage: 0 });
  assert.equal(empty.quizPerformance.rows.length, 1);
  assert.equal(empty.quizPerformance.hasMore, true);
});

test('leaderboard ranks best distinct scores, supports UTC periods and protects eligibility', async (t) => {
  const { db, account, category, quiz, attempt, request } = await fixture(t);
  const admin = await account('Ranking Admin', { role: 'ADMIN' });
  const a = await account('Aster');
  const b = await account('Beryl');
  const c = await account('Cedar');
  const inactive = await account('Inactive', { active: false });
  const archived = await account('Archived', { active: false, archivedAt: new Date() });
  const excluded = await account('Excluded', { leaderboardExcluded: true });
  const old = await account('Old period only');
  const source = await category('Prior category');
  const destination = await category('Current category');
  const q1 = await quiz('Moved quiz', destination.id, 'PUBLISHED');
  const q2 = await quiz('Other quiz', destination.id, 'PUBLISHED');
  const [{ now }] = await db.$queryRaw`SELECT CURRENT_TIMESTAMP AS now`;
  const midnight = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  const week = new Date(midnight.getTime() - ((midnight.getUTCDay() + 6) % 7) * 86_400_000);
  const month = new Date(Date.UTC(midnight.getUTCFullYear(), midnight.getUTCMonth(), 1));
  const periodStart = new Date(Math.max(week.getTime(), month.getTime()));
  await attempt(a, q1, source.id, 80, periodStart);
  await attempt(a, q1, source.id, 30, periodStart);
  await attempt(a, q2, destination.id, 60, periodStart);
  await attempt(b, q1, source.id, 80, periodStart);
  await attempt(b, q2, destination.id, 60, periodStart);
  await attempt(c, q1, source.id, 70, periodStart);
  await attempt(old, q1, source.id, 95, new Date(Math.min(week.getTime(), month.getTime()) - 1));
  for (const user of [admin, inactive, archived, excluded]) await attempt(user, q1, source.id, 100, periodStart);
  await db.attempt.create({ data: {
    userId: a.id, quizTitle: 'Legacy rank test', startedAt: date('05'), finalizedAt: date('05'), score: 100, passed: true,
  } });

  const byName = (entries, user) => entries.find((row) => row.displayName === user.name);
  await request('/leaderboard', null, 401);
  for (const invalid of ['categoryId=x', 'period=daily', 'limit=51', 'page=0', 'other=1']) {
    await request('/leaderboard?' + invalid, a, 400);
  }
  const overall = await request('/leaderboard?limit=50', a);
  assert.ok(byName(overall.entries, old));
  for (const user of [admin, inactive, archived, excluded]) assert.equal(byName(overall.entries, user), undefined);
  const first = byName(overall.entries, a);
  const tied = byName(overall.entries, b);
  const third = byName(overall.entries, c);
  assert.deepEqual([first.averageScore, first.highestScore, first.quizzesCompleted], [70, 80, 2]);
  assert.equal(first.rank, tied.rank);
  assert.ok(overall.entries.indexOf(first) < overall.entries.indexOf(tied));
  assert.ok(third.rank > first.rank);
  assert.deepEqual(Object.keys(first).sort(), ['averageScore', 'displayName', 'highestScore', 'quizzesCompleted', 'rank']);
  assert.equal(byName((await request('/leaderboard?limit=50', admin)).entries, a).studentId, a.id);

  const categoryPath = '/leaderboard?categoryId=' + source.id;
  const [, page2] = await Promise.all([
    request(categoryPath + '&limit=2', a).then((result) => assert.equal(result.hasMore, true)),
    request(categoryPath + '&limit=2&page=2', a),
  ]);
  assert.deepEqual(page2.entries.map(({ displayName }) => displayName), [b.name, c.name]);
  for (const period of ['weekly', 'monthly']) {
    const recent = await request(categoryPath + '&period=' + period, a);
    assert.deepEqual(recent.entries.map(({ displayName, rank, averageScore }) => [displayName, rank, averageScore]),
      [[a.name, 1, 80], [b.name, 1, 80], [c.name, 3, 70]]);
  }
  const moved = await request('/leaderboard?categoryId=' + destination.id, a);
  assert.equal(byName(moved.entries, a).averageScore, 60);
  assert.equal(byName(moved.entries, c), undefined);
  const empty = await request('/leaderboard?categoryId=' + randomUUID(), a);
  assert.deepEqual(empty.entries, []);
  assert.ok((await request('/leaderboard/categories', a)).categories.some(({ id }) => id === source.id));

  const exclusionPath = '/admin/leaderboard/exclusions';
  await request(exclusionPath, a, 403);
  await request(exclusionPath + '/' + a.id, a, 403, { excluded: true });
  await request(exclusionPath + '/' + admin.id, admin, 404, { excluded: true });
  await request(exclusionPath + '/' + a.id, admin, 400, { score: 100 });
  const dashboardBefore = await request('/admin/dashboard', admin);
  const studentBefore = await request('/student/dashboard', a);
  await request(exclusionPath + '/' + a.id, admin, 200, { excluded: true });
  assert.ok((await request(exclusionPath, admin)).students.some(({ id }) => id === a.id));
  assert.equal(byName((await request(categoryPath, b)).entries, a), undefined);
  assert.deepEqual(await request('/admin/dashboard', admin), dashboardBefore);
  assert.deepEqual(await request('/student/dashboard', a), studentBefore);
  await request(exclusionPath + '/' + a.id, admin, 200, { excluded: false });
  assert.ok(byName((await request(categoryPath, b)).entries, a));
});


test('calendar week and month filters use independent UTC start boundaries', async (t) => {
  let now = new Date('2026-08-03T12:00:00Z'); // Monday, after the Saturday month boundary.
  const { db, account, category, quiz, attempt, request } = await fixture(t, () => now);
  const monthOnly = await account('Month only');
  const weekOnly = await account('Week only');
  const shared = await account('Both');
  const historical = await category('Former category');
  const current = await category('Current category');
  const assessment = await quiz('Moved assessment', current.id, 'PUBLISHED');
  const path = '/leaderboard?categoryId=' + historical.id;
  await attempt(monthOnly, assessment, historical.id, 90, new Date('2026-08-01T00:00:00Z'));
  await attempt(shared, assessment, historical.id, 80, new Date('2026-08-03T00:00:00Z'));
  const entries = async (period) => (await request(path + '&period=' + period, shared)).entries.map(({ displayName }) => displayName);
  assert.deepEqual(await entries('weekly'), [shared.name]);
  assert.deepEqual(await entries('monthly'), [monthOnly.name, shared.name]);

  now = new Date('2026-09-01T12:00:00Z'); // Tuesday, after the Monday week boundary.
  await attempt(weekOnly, assessment, historical.id, 95, new Date('2026-08-31T00:00:00Z'));
  await attempt(shared, assessment, historical.id, 80, new Date('2026-09-01T00:00:00Z'));
  assert.deepEqual(await entries('weekly'), [weekOnly.name, shared.name]);
  assert.deepEqual(await entries('monthly'), [shared.name]);

  await db.category.delete({ where: { id: historical.id } });
  assert.deepEqual(await entries('weekly'), [weekOnly.name, shared.name]);
  const categories = await request('/leaderboard/categories', shared);
  assert.match(categories.categories.find(({ id }) => id === historical.id).name, /^Unavailable category/);
});
