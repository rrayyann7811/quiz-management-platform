import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadRequest } from '../src/load-request.js';

for (const path of ['/admin/analytics', '/leaderboard']) {
  test(path + ' drops out-of-order results and errors for cancelled filters', async () => {
    const old = new AbortController();
    const newer = new AbortController();
    const rendered = [];
    const publish = (state) => rendered.push(state);
    const delayed = Promise.withResolvers();
    const delayedError = Promise.withResolvers();
    const first = loadRequest(() => delayed.promise, old.signal, publish);
    const parallel = loadRequest(() => delayedError.promise, old.signal, publish);
    old.abort();

    const data = { path, filter: 'monthly' };
    await loadRequest(async () => ({ data }), newer.signal, publish);
    delayed.resolve({ data: { path, filter: 'weekly' } });
    delayedError.reject(new Error('Late error'));
    await Promise.all([first, parallel]);
    assert.deepEqual(rendered, [{ data }]);

    await loadRequest(async () => { throw new Error('network'); }, newer.signal, publish);
    assert.deepEqual(rendered[1], { error: 'Could not reach the server.' });
  });
}
