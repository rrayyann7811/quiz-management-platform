import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listenForAttemptResume } from '../src/attempt-resume.js';

test('attempt resume requests fresh server state on visible focus or visibility change', () => {
  const browser = new EventTarget();
  const page = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
  let refreshes = 0;
  const stop = listenForAttemptResume(() => { refreshes += 1; }, browser, page);

  browser.dispatchEvent(new Event('focus'));
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshes, 0);

  page.visibilityState = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshes, 1);
  browser.dispatchEvent(new Event('focus'));
  assert.equal(refreshes, 2);

  stop();
  browser.dispatchEvent(new Event('focus'));
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshes, 2);
});
