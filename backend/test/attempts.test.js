import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { connectLocalTestDatabase } from '../testing/local-database.js';

test('attempt lifecycle secures ownership, scoring, persistence and concurrent operations', async () => {
  const db = await connectLocalTestDatabase();
  const suffix = randomUUID();
  let now = new Date('2026-01-01T12:00:00Z');
  const clock = () => now;
  let server;
  let categoryId;
  const userIds = [];
  const quizIds = [];

  async function startServer() {
    server = createApp({ db, origin: 'http://localhost:5173', attemptClock: clock }).listen(0, '127.0.0.1');
    await once(server, 'listening');
  }

  async function stopServer() {
    if (!server) return;
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }

  async function session(role) {
    const token = randomBytes(32).toString('hex');
    const user = await db.user.create({
      data: {
        email: randomUUID() + '@example.test', name: 'Attempt test', role, passwordHash: 'login-disabled',
        sessions: { create: {
          digest: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 600_000),
        } },
      },
    });
    userIds.push(user.id);
    return { token, id: user.id };
  }

  async function fixtureQuiz(status, maxAttempts = 2) {
    const quiz = await db.quiz.create({
      data: {
        categoryId, title: 'Attempt fixture ' + suffix, description: 'Private test data.', difficulty: 'MEDIUM',
        durationMinutes: 2, passingPercent: 60, maxAttempts, status,
        questions: { create: [6, 3, 1].map((marks, index) => ({
          text: 'Question ' + index, explanation: 'Private explanation ' + index, marks, difficulty: 'MEDIUM',
          options: { create: [{ text: 'Option A', isCorrect: true, position: 0 }, { text: 'Option B', isCorrect: false, position: 1 }] },
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        })) },
      },
    });
    quizIds.push(quiz.id);
    return quiz;
  }

  async function request(method, path, account, body, expected) {
    const result = await fetch('http://127.0.0.1:' + server.address().port + '/api' + path, {
      method, headers: { ...(account && { Authorization: 'Bearer ' + account.token }),
        ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body),
    });
    const data = await result.json();
    if (expected !== undefined) assert.equal(result.status, expected, method + ' ' + path + ' ' + JSON.stringify(data));
    return { status: result.status, data };
  }

  try {
    await startServer();
    const [student, other, admin] = await Promise.all([session('STUDENT'), session('STUDENT'), session('ADMIN')]);
    categoryId = (await db.category.create({ data: { name: 'Attempt fixture ' + suffix } })).id;
    const quiz = await fixtureQuiz('PUBLISHED');
    const unpublished = await fixtureQuiz('UNPUBLISHED');
    const startPath = '/quizzes/' + quiz.id + '/start';
    const eligibility = () => request('GET', '/quizzes/' + quiz.id + '/eligibility', student, null, 200);
    await request('POST', '/quizzes/' + unpublished.id + '/start', student, {}, 404);
    await request('POST', startPath, admin, {}, 403);
    await request('POST', startPath, null, {}, 401);
    await request('POST', startPath, student, { startedAt: now }, 400);
    assert.equal((await eligibility()).data.remainingAttempts, 2);
    const discovery = await request('GET', '/quizzes?search=' + suffix.toUpperCase() + '&difficulty=MEDIUM&maxDuration=2&sort=recent', student, null, 200);
    assert.deepEqual(discovery.data.quizzes.map(({ id }) => id), [quiz.id]);
    assert.deepEqual((await request('GET', '/quizzes?search=' + suffix + '&maxDuration=1', student, null, 200)).data.quizzes, []);
    await request('GET', '/quizzes?minDuration=10&maxDuration=5', student, null, 400);

    const simultaneousStarts = await Promise.all([1, 2, 3].map(() => request('POST', startPath, student, {})));
    assert.deepEqual(simultaneousStarts.map(({ status }) => status).sort(), [200, 200, 201]);
    const attempt = simultaneousStarts[0].data.attempt;
    assert.ok(simultaneousStarts.every(({ data }) => data.attempt.id === attempt.id && data.attempt.expiresAt === attempt.expiresAt));
    assert.equal(await db.attempt.count({ where: { userId: student.id, quizId: quiz.id } }), 1);
    assert.equal(new Date(attempt.expiresAt) - new Date(attempt.startedAt), 120_000);
    assert.doesNotMatch(JSON.stringify(attempt), /isCorrect|explanation|marks|snapshot|Private explanation/i);
    assert.deepEqual((await eligibility()).data, { remainingAttempts: 1, activeAttemptId: attempt.id });
    assert.equal((await request('GET', '/attempts/active', student, null, 200)).data.attempts[0].id, attempt.id);
    assert.equal((await request('GET', '/users/' + student.id + '/attempts', admin, null, 200)).data.total, 0);
    const path = '/attempts/' + attempt.id;
    const save = (questionId, optionId, status = 200) => request('PUT', path + '/answers', student, { questionId, optionId }, status);
    const [first, second] = attempt.questions;
    await request('GET', path, other, null, 404);
    await request('POST', path + '/submit', other, {}, 404);
    await request('PUT', path + '/answers', other, { questionId: first.id, optionId: first.options[0].id }, 404);
    await request('GET', path, admin, null, 403);
    await request('GET', '/attempts/not-a-uuid', student, null, 400);
    await save(first.id, second.options[0].id, 400);
    await save(randomUUID(), first.options[0].id, 400);
    await save(first.id, first.options[1].id);
    await save(first.id, first.options[0].id);
    await save(first.id, first.options[0].id);
    await save(second.id, second.options[1].id);
    await request('PUT', path + '/answers', student, { questionId: first.id, optionId: first.options[0].id, isCorrect: true }, 400);
    now = new Date(now.getTime() + 34_900);
    const refreshed = (await request('GET', path, student, null, 200)).data.attempt;
    assert.deepEqual(refreshed.answers, { [first.id]: first.options[0].id, [second.id]: second.options[1].id });
    assert.equal(refreshed.expiresAt, attempt.expiresAt);
    assert.equal(refreshed.serverNow, now.toISOString());
    assert.equal((await request('POST', path + '/submit', student, { onlyIfExpired: true }, 200)).data.attempt.status, 'IN_PROGRESS');
    await request('POST', path + '/submit', student, { score: 100 }, 400);
    await assert.rejects(db.attempt.update({ where: { id: attempt.id }, data: { expiresAt: new Date(Date.now() + 360_000) } }),
      /identity, deadline and snapshot cannot be updated/);

    // Edit the source after the attempt began. Neither the active question nor its grading may change.
    await request('POST', '/quizzes/' + quiz.id + '/publish', admin, { published: false }, 200);
    const changedQuestion = {
      text: 'Changed source text', explanation: 'Changed source explanation', difficulty: 'HARD', marks: 20,
      options: [{ text: 'Different option', isCorrect: false }, { text: 'Now correct', isCorrect: true }],
    };
    await request('PATCH', '/questions/' + first.id, admin, changedQuestion, 200);
    assert.equal((await request('GET', path, student, null, 200)).data.attempt.questions[0].text, first.text);
    await request('POST', '/quizzes/' + quiz.id + '/publish', admin, { published: true }, 200);

    const submitted = (await request('POST', path + '/submit', student, {}, 200)).data.attempt;
    assert.equal(submitted.status, 'SUBMITTED');
    assert.deepEqual(submitted.summary, {
      totalQuestions: 3, correctCount: 1, incorrectCount: 1, unansweredCount: 1, maximumMarks: 10, obtainedMarks: 6,
      percentage: 60, passed: true, elapsedSeconds: 34,
    });
    assert.equal(submitted.finalizedAt, now.toISOString());
    await save(first.id, first.options[1].id, 409);
    await assert.rejects(db.attempt.update({ where: { id: attempt.id }, data: { score: 100 } }), /Finalized attempts cannot be updated/);
    assert.deepEqual((await request('POST', path + '/submit', student, {}, 200)).data.attempt, submitted);
    assert.equal((await request('GET', '/users/' + student.id + '/attempts', admin, null, 200)).data.attempts[0].score, 60);

    const secondAttempt = (await request('POST', startPath, student, {}, 201)).data.attempt;
    const secondPath = '/attempts/' + secondAttempt.id;
    const updatedQuestion = secondAttempt.questions[0];
    await request('PUT', secondPath + '/answers', student,
      { questionId: updatedQuestion.id, optionId: updatedQuestion.options[1].id }, 200);
    const thirdQuestion = secondAttempt.questions[2];
    await request('PUT', secondPath + '/answers', student,
      { questionId: thirdQuestion.id, optionId: thirdQuestion.options[0].id }, 200);
    assert.deepEqual((await eligibility()).data, { remainingAttempts: 0, activeAttemptId: secondAttempt.id });
    assert.equal((await request('POST', startPath, student, {}, 200)).data.attempt.id, secondAttempt.id);
    now = new Date(new Date(secondAttempt.expiresAt).getTime() + 40_000);
    await stopServer();
    await startServer();
    await request('PUT', secondPath + '/answers', student,
      { questionId: updatedQuestion.id, optionId: updatedQuestion.options[0].id }, 409);
    const timedOut = (await request('GET', secondPath, student, null, 200)).data.attempt;
    assert.equal(timedOut.status, 'TIMED_OUT');
    assert.equal(timedOut.finalizedAt, secondAttempt.expiresAt);
    assert.equal(timedOut.summary.elapsedSeconds, 120);
    assert.equal(timedOut.summary.percentage, 87.5);
    assert.equal(timedOut.summary.correctCount, 2);
    assert.deepEqual((await eligibility()).data, { remainingAttempts: 0, activeAttemptId: null });
    await request('POST', startPath, student, {}, 409);

    const otherAttempt = (await request('POST', startPath, other, {}, 201)).data.attempt;
    const otherPath = '/attempts/' + otherAttempt.id;
    const raceQuestion = otherAttempt.questions[1];
    const [racedSave, racedSubmit] = await Promise.all([
      request('PUT', otherPath + '/answers', other, { questionId: raceQuestion.id, optionId: raceQuestion.options[0].id }),
      request('POST', otherPath + '/submit', other, {}, 200),
    ]);
    assert.ok([200, 409].includes(racedSave.status));
    assert.equal(racedSubmit.data.attempt.summary.percentage, racedSave.status === 200 ? 12.5 : 0);
    assert.equal(racedSubmit.data.attempt.summary.passed, false);

    const abandoned = (await request('POST', startPath, other, {}, 201)).data.attempt;
    await request('POST', '/quizzes/' + quiz.id + '/publish', admin, { published: false }, 200);
    assert.equal((await request('GET', '/attempts/active', other, null, 200)).data.attempts[0].id, abandoned.id);
    now = new Date(abandoned.expiresAt);
    const settled = (await request('GET', '/attempts/' + abandoned.id, other, null, 200)).data.attempt;
    assert.equal(settled.status, 'TIMED_OUT');
    assert.equal(settled.summary.unansweredCount, 3);
    assert.equal(settled.summary.passed, false);

    await db.quiz.update({ where: { id: quiz.id }, data: { status: 'UNPUBLISHED', archivedAt: now } });
    assert.deepEqual((await request('GET', path, student, null, 200)).data.attempt.summary, submitted.summary);
    assert.equal((await request('GET', path, student, null, 200)).data.attempt.quizTitle, quiz.title);
    await db.user.update({ where: { id: student.id }, data: { active: false } });
    await request('GET', path, student, null, 401);
  } finally {
    try {
      await stopServer();
      await db.attempt.deleteMany({ where: { userId: { in: userIds } } });
      await db.quiz.deleteMany({ where: { id: { in: quizIds } } });
      if (categoryId) await db.category.delete({ where: { id: categoryId } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await db.$disconnect();
    }
  }
});
