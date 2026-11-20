import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { connectLocalTestDatabase } from '../testing/local-database.js';

test('finalized results, snapshot review, legacy history and performance are ownership-scoped', async () => {
  const db = await connectLocalTestDatabase();
  const userIds = [];
  let categoryId;
  let quizId;
  let now = new Date('2026-05-05T10:00:00Z');
  const server = createApp({ db, origin: 'http://localhost:5173', attemptClock: () => now }).listen(0, '127.0.0.1');

  async function session(role) {
    const token = randomBytes(32).toString('hex');
    const user = await db.user.create({ data: {
      role, email: randomUUID() + '@example.test', name: 'Result test', passwordHash: 'fixture-only',
      sessions: { create: { digest: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 600_000) } },
    } });
    userIds.push(user.id);
    return { id: user.id, token };
  }

  async function request(method, path, account, body, expected = 200) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api' + path, {
      method,
      headers: { ...(account && { Authorization: 'Bearer ' + account.token }), ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
    const data = response.status === 204 ? null : await response.json();
    assert.equal(response.status, expected, `${method} ${path} ${JSON.stringify(data)}`);
    return data;
  }

  try {
    await once(server, 'listening');
    const [student, other, admin] = await Promise.all([session('STUDENT'), session('STUDENT'), session('ADMIN')]);
    const dashboard = (account = student) => request('GET', '/student/dashboard', account);
    assert.deepEqual(await dashboard(other), {
      stats: { totalAttempts: 0, passedAttempts: 0, failedAttempts: 0, averageScore: null, highestScore: null,
        answeredQuestions: 0, missingQuestionCounts: 0 },
      activeAttempts: [], recentAttempts: [], scoreTrend: [],
    });

    categoryId = (await db.category.create({ data: { name: 'Review fixture ' + randomUUID() } })).id;
    const quiz = {
      categoryId, title: 'Snapshot review', description: 'Fixture quiz.', difficulty: 'EASY',
      durationMinutes: 2, passingPercent: 60, maxAttempts: 2,
    };
    quizId = (await db.quiz.create({ data: { ...quiz, status: 'PUBLISHED',
      questions: { create: [6, 3, 1].map((marks, index) => ({
        text: 'Original question ' + index, explanation: 'Frozen explanation ' + index, difficulty: 'EASY', marks,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        options: { create: [{ text: 'Original correct', position: 0, isCorrect: true }, { text: 'Original wrong', position: 1, isCorrect: false }] },
      })) },
    } })).id;
    const start = async () => (await request('POST', '/quizzes/' + quizId + '/start', student, {}, 201)).attempt;
    const attempt = await start();
    const path = '/attempts/' + attempt.id;
    const resultPath = path + '/result';
    const adminPath = '/admin' + resultPath;
    const [first, second] = attempt.questions;
    assert.deepEqual((await dashboard()).activeAttempts.map(({ id }) => id), [attempt.id]);

    for (const [account, status] of [[undefined, 401], [other, 404], [student, 409], [admin, 403]]) {
      const body = await request('GET', resultPath, account, null, status);
      assert.doesNotMatch(JSON.stringify(body), /Frozen explanation|correctOptionId|snapshot/);
    }
    await request('GET', adminPath, student, null, 403);
    await request('GET', adminPath, admin, null, 404);
    const answer = (question, selected) => request('PUT', path + '/answers', student,
      { questionId: question.id, optionId: question.options[selected].id });
    await answer(first, 0);
    await answer(second, 1);
    now = new Date(now.getTime() + 19_000);
    const [during] = await Promise.all([
      request('GET', '/attempts?pageSize=50', student),
      request('POST', path + '/submit', student, {}),
    ]);
    assert.equal(during.total, during.attempts.length);
    const { result } = await request('GET', resultPath, student);
    assert.equal(result.quizTitle, quiz.title);
    assert.equal(result.finalizedAt, now.toISOString());
    assert.equal(result.totalQuestions, 3);
    assert.deepEqual([result.correctCount, result.incorrectCount, result.unansweredCount], [1, 1, 1]);
    assert.deepEqual([result.percentage, result.passed, result.elapsedSeconds, result.obtainedMarks, result.maximumMarks], [60, true, 19, 6, 10]);
    assert.deepEqual(result.review.map(({ status, marks, awardedMarks, selectedOptionId, correctOptionId, explanation }) =>
      [status, marks, awardedMarks, selectedOptionId, correctOptionId, explanation]), [
      ['CORRECT', 6, 6, first.options[0].id, first.options[0].id, 'Frozen explanation 0'],
      ['INCORRECT', 3, 0, second.options[1].id, second.options[0].id, 'Frozen explanation 1'],
      ['UNANSWERED', 1, 0, null, attempt.questions[2].options[0].id, 'Frozen explanation 2'],
    ]);
    assert.deepEqual(result.review[0].options, first.options);
    assert.equal(result.review[0].text, 'Original question 0');
    assert.doesNotMatch(JSON.stringify(result), /"snapshot"|"isCorrect"|"answers"|"userId"/);
    assert.equal((await request('GET', adminPath, admin)).student.id, student.id);
    await request('GET', resultPath, other, null, 404);

    const timed = await start();
    now = new Date(new Date(timed.expiresAt).getTime() + 1000);
    const timeoutResult = (await request('GET', '/attempts/' + timed.id + '/result', student)).result;
    assert.equal(timeoutResult.status, 'TIMED_OUT');
    assert.equal(timeoutResult.finalizedAt, timed.expiresAt);
    assert.equal(timeoutResult.percentage, 0);
    assert.ok(timeoutResult.review.every(({ status }) => status === 'UNANSWERED'));

    await request('POST', '/quizzes/' + quizId + '/publish', admin, { published: false });
    await request('PATCH', '/questions/' + first.id, admin, {
      text: 'Edited question', explanation: 'Edited explanation', difficulty: 'HARD', marks: 10,
      options: [{ text: 'Different correct', isCorrect: true }, { text: 'Different wrong', isCorrect: false }],
    });
    await request('PATCH', '/quizzes/' + quizId, admin, { ...quiz, title: 'Edited quiz' });
    await request('DELETE', '/quizzes/' + quizId, admin, null, 204);
    assert.deepEqual((await request('GET', resultPath, student)).result, result);

    const legacy = await db.attempt.create({ data: {
      userId: student.id, quizTitle: 'Legacy review', startedAt: new Date('2026-04-30T09:00:00Z'),
      finalizedAt: new Date('2026-04-30T10:00:00Z'), score: 90, passed: true,
    } });
    const legacyResult = (await request('GET', '/attempts/' + legacy.id + '/result', student)).result;
    assert.equal(legacyResult.percentage, 90);
    assert.equal(legacyResult.passed, true);
    assert.equal(legacyResult.finalizedAt, legacy.finalizedAt.toISOString());
    for (const key of ['review', 'elapsedSeconds', 'totalQuestions', 'correctCount', 'incorrectCount', 'unansweredCount', 'maximumMarks', 'obtainedMarks']) {
      assert.equal(legacyResult[key], null);
    }

    const history = (page) => request('GET', '/attempts?pageSize=2&page=' + page, student);
    const firstPage = await history(1);
    assert.equal(firstPage.total, 3);
    assert.deepEqual(firstPage.attempts.map(({ id }) => id), [timed.id, attempt.id]);
    assert.deepEqual((await history(2)).attempts.map(({ id }) => id), [legacy.id]);
    assert.deepEqual((await history(3)).attempts, []);
    await request('GET', '/attempts?pageSize=51', student, null, 400);
    assert.deepEqual((await request('GET', '/attempts', other)).attempts, []);
    const populated = await dashboard();
    assert.deepEqual(populated.stats, {
      totalAttempts: 3, passedAttempts: 2, failedAttempts: 1, averageScore: 50, highestScore: 90,
      answeredQuestions: 2, missingQuestionCounts: 1,
    });
    assert.deepEqual(populated.recentAttempts.map(({ id }) => id), [timed.id, attempt.id, legacy.id]);
    assert.deepEqual(populated.scoreTrend.map(({ percentage }) => percentage), [90, 60, 0]);
    await db.user.update({ where: { id: student.id }, data: { active: false } });
    await request('GET', resultPath, student, null, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try {
      await db.attempt.deleteMany({ where: { userId: { in: userIds } } });
      if (quizId) await db.quiz.delete({ where: { id: quizId } });
      if (categoryId) await db.category.delete({ where: { id: categoryId } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await db.$disconnect();
    }
  }
});
