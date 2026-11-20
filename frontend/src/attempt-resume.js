export function listenForAttemptResume(refresh, browser = window, page = document) {
  function refreshIfVisible() {
    if (page.visibilityState === 'visible') refresh();
  }
  browser.addEventListener('focus', refreshIfVisible);
  page.addEventListener('visibilitychange', refreshIfVisible);
  return () => {
    browser.removeEventListener('focus', refreshIfVisible);
    page.removeEventListener('visibilitychange', refreshIfVisible);
  };
}
