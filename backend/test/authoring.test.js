import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { connectLocalTestDatabase } from '../testing/local-database.js';

test('admins manage categories, assessments and options while students see only published metadata', async () => {
  const db = await connectLocalTestDatabase();
  const suffix = randomUUID();
  const server = createApp({ db, origin: 'http://localhost:5173' }).listen(0, '127.0.0.1');
  const categoryIds = [];
  let quizId;

  async function session(role) {
    const token = randomBytes(32).toString('hex');
    await db.user.create({
      data: {
        email: role + '-' + suffix + '@example.test', name: 'Test ' + role, role,
        passwordHash: 'fixture-only-login-disabled',
        sessions: { create: {
          digest: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 60_000),
        } },
      },
    });
    return token;
  }

  async function request(method, path, token, body, status) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api' + path, {
      method,
      headers: { ...(token && { Authorization: 'Bearer ' + token }), ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
    const data = response.status === 204 ? null : await response.json();
    assert.equal(response.status, status, method + ' ' + path + ' ' + JSON.stringify(data));
    return data;
  }

  try {
    await once(server, 'listening');
    const [admin, student] = await Promise.all([session('ADMIN'), session('STUDENT')]);
    const categoryName = 'Assessment ' + suffix;
    const { category } = await request('POST', '/categories', admin, { name: categoryName }, 201);
    categoryIds.push(category.id);
    const categoryPath = '/categories/' + category.id;
    await request('POST', '/categories', student, { name: 'Forbidden' }, 403);
    await request('POST', '/categories', null, { name: 'Forbidden' }, 401);
    await request('POST', '/categories', admin, { name: ' ' + categoryName.toUpperCase() + ' ' }, 409);
    const updated = await request('PATCH', categoryPath, admin, { name: 'Updated ' + suffix }, 200);
    assert.equal(updated.category.name, 'Updated ' + suffix);

    const quiz = {
      title: 'HTTP Fundamentals', description: 'Identify basic HTTP semantics.', categoryId: category.id,
      difficulty: 'EASY', durationMinutes: 12, passingPercent: 75, maxAttempts: 2, thumbnailUrl: null,
    };
    for (const invalid of [{ durationMinutes: 0 }, { passingPercent: 101 }, { maxAttempts: 0 },
      { thumbnailUrl: 'javascript:alert(1)' }, { status: 'PUBLISHED' }]) {
      await request('POST', '/quizzes', admin, { ...quiz, ...invalid }, 400);
    }
    await request('POST', '/quizzes', admin, { ...quiz, categoryId: randomUUID() }, 404);
    await request('POST', '/quizzes', student, quiz, 403);
    ({ quiz: { id: quizId } } = await request('POST', '/quizzes', admin, quiz, 201));
    const quizPath = '/quizzes/' + quizId;
    const questionsPath = quizPath + '/questions';
    const publish = (published, status) => request('POST', quizPath + '/publish', admin, { published }, status);
    await request('GET', '/quizzes/invalid', admin, null, 400);
    await request('GET', quizPath, student, null, 404);
    assert.deepEqual((await request('GET', '/quizzes?categoryId=' + category.id, student, null, 200)).quizzes, []);
    assert.equal((await request('GET', categoryPath, admin, null, 200)).quizzes[0].id, quizId);
    await request('DELETE', categoryPath, admin, null, 409);
    assert.equal((await request('PATCH', quizPath, admin, { ...quiz, title: 'HTTP Basics' }, 200)).quiz.title, 'HTTP Basics');
    await publish(true, 422);
    assert.equal((await db.quiz.findUnique({ where: { id: quizId } })).status, 'DRAFT');

    const question = {
      text: 'What does HTTP 404 indicate?', explanation: 'The requested resource could not be found.',
      marks: 2, difficulty: 'EASY',
      options: [{ text: 'Resource missing', isCorrect: true }, { text: 'Request succeeded', isCorrect: false }],
    };
    for (const invalid of [{ marks: 0 }, { options: [question.options[0]] },
      { options: question.options.map((option) => ({ ...option, isCorrect: false })) },
      { options: question.options.map((option) => ({ ...option, isCorrect: true })) }]) {
      await request('POST', questionsPath, admin, { ...question, ...invalid }, 400);
    }
    const incomplete = await db.question.create({
      data: { quizId, text: 'Incomplete fixture', explanation: 'Fixture', marks: 1, difficulty: 'EASY' },
    });
    await publish(true, 422);
    assert.equal((await db.quiz.findUnique({ where: { id: quizId } })).status, 'DRAFT');
    await request('DELETE', '/questions/' + incomplete.id, admin, null, 204);
    const { question: created } = await request('POST', questionsPath, admin, question, 201);
    const questionPath = '/questions/' + created.id;
    const reordered = [question.options[1], question.options[0], { text: 'Rate limit reached', isCorrect: false }];
    const edited = await request('PATCH', questionPath, admin, { ...question, marks: 3, options: reordered }, 200);
    assert.deepEqual(edited.question.options.map(({ text, isCorrect }) => ({ text, isCorrect })), reordered);
    assert.equal((await request('GET', questionPath, admin, null, 200)).question.marks, 3);
    assert.equal((await request('GET', questionsPath, admin, null, 200)).questions.length, 1);
    await request('POST', quizPath + '/publish', student, { published: true }, 403);

    assert.equal((await publish(true, 200)).quiz.status, 'PUBLISHED');
    const studentDetail = await request('GET', quizPath, student, null, 200);
    assert.equal(studentDetail.quiz._count.questions, 1);
    assert.equal(studentDetail.quiz.status, 'PUBLISHED');
    assert.deepEqual((await request('GET', '/quizzes?categoryId=' + category.id, student, null, 200)).quizzes, [studentDetail.quiz]);
    assert.ok((await request('GET', '/categories', student, null, 200)).categories.some(({ id }) => id === category.id));
    assert.doesNotMatch(JSON.stringify(studentDetail), /isCorrect|explanation|Resource missing/);
    await request('GET', questionsPath, student, null, 403);
    await request('GET', questionPath, student, null, 403);
    await request('PATCH', questionPath, admin, question, 409);
    await request('DELETE', questionPath, admin, null, 409);
    await request('PATCH', quizPath, admin, quiz, 409);

    assert.equal((await publish(false, 200)).quiz.status, 'UNPUBLISHED');
    await request('GET', quizPath, student, null, 404);
    assert.deepEqual((await request('GET', '/quizzes?categoryId=' + category.id, student, null, 200)).quizzes, []);

    const [publishRace, deleteRace] = await Promise.all([
      fetch('http://127.0.0.1:' + server.address().port + '/api' + quizPath + '/publish', {
        method: 'POST', headers: { Authorization: 'Bearer ' + admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: true }),
      }),
      fetch('http://127.0.0.1:' + server.address().port + '/api' + questionPath, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + admin },
      }),
    ]);
    assert.ok(
      (publishRace.status === 200 && deleteRace.status === 409)
      || (publishRace.status === 422 && deleteRace.status === 204),
      'Concurrent publication and deletion must preserve a valid published state.',
    );
    if (publishRace.status === 200) {
      await publish(false, 200);
      await request('DELETE', questionPath, admin, null, 204);
    }
    assert.equal(await db.option.count({ where: { questionId: created.id } }), 0);
    await request('DELETE', quizPath, admin, null, 204);
    await request('GET', quizPath, admin, null, 404);
    const archived = await db.quiz.findUnique({ where: { id: quizId } });
    assert.ok(archived.archivedAt);
    assert.equal(archived.status, 'UNPUBLISHED');
    const empty = await request('POST', '/categories', admin, { name: 'Empty ' + suffix }, 201);
    categoryIds.push(empty.category.id);
    await request('DELETE', '/categories/' + empty.category.id, admin, null, 204);
    await request('GET', '/categories/' + empty.category.id, admin, null, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (quizId) await db.quiz.deleteMany({ where: { id: quizId } });
    await db.category.deleteMany({ where: { id: { in: categoryIds } } });
    await db.user.deleteMany({ where: { email: { endsWith: suffix + '@example.test' } } });
    await db.$disconnect();
  }
});
