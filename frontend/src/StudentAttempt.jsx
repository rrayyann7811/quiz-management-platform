import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { requestError, RequestStatus } from './StudentQuizzes.jsx';
import { listenForAttemptResume } from './attempt-resume.js';
import { Badge, Icon, PageHeading } from './ui.jsx';

const navigationButton = 'button-secondary';

function formatTime(totalSeconds) {
  return Math.floor(totalSeconds / 60) + ':' + String(totalSeconds % 60).padStart(2, '0');
}

function SubmissionSummary({ attempt }) {
  const { summary } = attempt;
  return (
    <section className={'card max-w-2xl space-y-5 ' + (summary.passed ? 'result-pass' : 'result-fail')}>
      <h1 className="text-2xl font-semibold">{attempt.status === 'TIMED_OUT' ? 'Time expired. Quiz submitted.' : 'Quiz submitted successfully'}</h1>
      <p className="break-words font-medium">{attempt.quizTitle}</p>
      <div className="flex flex-wrap items-center gap-3"><strong className="result-score">{summary.percentage}%</strong><Badge>{summary.passed ? "Passed" : "Failed"}</Badge></div>
      <progress className="progress" max={100} value={summary.percentage} aria-label="Percentage score" />
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Object.entries({
          Correct: summary.correctCount, Incorrect: summary.incorrectCount, Unanswered: summary.unansweredCount,
          'Time taken': formatTime(summary.elapsedSeconds),
        }).map(([name, value]) => <div key={name}><dt className="text-sm text-muted">{name}</dt><dd className="font-semibold">{value}</dd></div>)}
      </dl>
      <nav className="flex flex-wrap gap-4" aria-label="Submission navigation">
        <Link to={'/student/attempts/' + attempt.id + '/result'}>View detailed result</Link>
        <Link to="/student">Return to dashboard</Link>
      </nav>
    </section>
  );
}

export function StudentAttempt({ api }) {
  const { attemptId } = useParams();
  const path = '/attempts/' + attemptId;
  const [attempt, setAttempt] = useState(null);
  const [seconds, setSeconds] = useState(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const pending = useRef(false);
  const deadline = useRef(null);
  const confirmation = useRef(null);

  const receiveAttempt = useCallback((next, sentAt) => {
    if (next.status === 'IN_PROGRESS') {
      const due = new Date(next.expiresAt) - new Date(next.serverNow);
      // Anchor to monotonic time and estimate one-way response travel from the request round trip.
      deadline.current = performance.now() + due - (performance.now() - sentAt) / 2;
      setSeconds(Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000)));
    }
    setAttempt(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const sentAt = performance.now();
    api.get(path, { signal: controller.signal }).then(({ data }) => receiveAttempt(data.attempt, sentAt))
      .catch((error) => { if (!controller.signal.aborted) setError(requestError(error)); });
    return () => controller.abort();
  }, [api, path, receiveAttempt]);

  const active = attempt?.status === 'IN_PROGRESS';
  useEffect(() => {
    if (!active) return;
    function updateTime() {
      setSeconds(Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000)));
    }
    const ticker = window.setInterval(updateTime, 250);
    return () => window.clearInterval(ticker);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let retry;

    async function refresh() {
      if (document.visibilityState !== 'visible') return;
      if (pending.current) {
        retry = window.setTimeout(refresh, 200);
        return;
      }
      pending.current = true;
      setBusy('refresh');
      const sentAt = performance.now();
      try {
        const { data } = await api.get(path, { signal: controller.signal });
        receiveAttempt(data.attempt, sentAt);
        setError('');
      } catch (error) {
        if (!controller.signal.aborted) setError(requestError(error));
      } finally {
        pending.current = false;
        if (!controller.signal.aborted) setBusy('');
      }
    }

    const stop = listenForAttemptResume(() => {
      window.clearTimeout(retry);
      retry = window.setTimeout(refresh, 100);
    });
    return () => {
      stop();
      window.clearTimeout(retry);
      controller.abort();
    };
  }, [active, api, path, receiveAttempt]);

  const submit = useCallback(async (automatic) => {
    if (pending.current || (automatic && !navigator.onLine)) return;
    pending.current = true;
    setBusy('submit');
    setError('');
    try {
      const sentAt = performance.now();
      // The countdown may reach zero slightly early. The server must confirm expiry.
      const { data } = await api.post(path + '/submit', { onlyIfExpired: automatic });
      receiveAttempt(data.attempt, sentAt);
    } catch (error) {
      setError(requestError(error));
    } finally {
      pending.current = false;
      setBusy('');
    }
  }, [api, path, receiveAttempt]);

  const timeUp = active && seconds === 0;
  useEffect(() => {
    if (!timeUp) return;
    void submit(true);
    const retry = window.setInterval(() => void submit(true), 3000);
    const reconnect = () => void submit(true);
    window.addEventListener('online', reconnect);
    return () => {
      window.clearInterval(retry);
      window.removeEventListener('online', reconnect);
    };
  }, [timeUp, submit]);

  if (!attempt) return <><Link to="/student">Student dashboard</Link><div className="mt-4"><RequestStatus error={error} /></div></>;
  if (!active) return <SubmissionSummary attempt={attempt} />;
  const question = attempt.questions[index];
  const answered = Object.keys(attempt.answers).length;
  const unanswered = attempt.questions.length - answered;

  async function save(optionId) {
    if (pending.current || timeUp) return;
    pending.current = true;
    setBusy('save');
    setError('');
    try {
      const { data } = await api.put(path + '/answers', { questionId: question.id, optionId });
      setAttempt((current) => ({ ...current, answers: { ...current.answers, [data.questionId]: data.optionId } }));
    } catch (error) {
      setError(requestError(error));
      if (error.response?.status === 409) {
        try {
          const sentAt = performance.now();
          const { data } = await api.get(path);
          receiveAttempt(data.attempt, sentAt);
        } catch (refreshError) {
          setError(requestError(refreshError));
        }
      }
    } finally {
      pending.current = false;
      setBusy('');
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/student">Student dashboard</Link>
      <div className="attempt-head">
        <PageHeading title={attempt.quizTitle} description="Choose one answer per question. Your selections are saved automatically." />
        <p className={'timer' + (seconds <= 30 ? ' timer-critical' : seconds <= 120 ? ' timer-warning' : '')} role="timer">
          <Icon name="clock" size={17} />
          Time remaining: {formatTime(seconds)}
        </p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <section className="card attempt-question min-w-0 space-y-4">
          <p className="text-sm font-semibold text-muted">Question {index + 1} of {attempt.questions.length}</p>
          <progress className="progress" max={attempt.questions.length} value={index + 1} aria-label="Position in quiz" />
          <fieldset className="space-y-2" disabled={!!busy || timeUp}>
            <legend className="mb-3 break-words font-medium">{question.text}</legend>
            {question.options.map((option) => (
              <label key={option.id} className="answer-option">
                <input type="radio" className="radio mt-1 shrink-0" name="quiz-answer" checked={attempt.answers[question.id] === option.id}
                  onChange={() => save(option.id)} />
                <span className="min-w-0 break-words">{option.text}</span>
              </label>
            ))}
          </fieldset>
          {busy === 'save' && <p role="status" className="text-sm">Saving answer…</p>}
          {timeUp && <p role="status" className="text-sm">Time is up. Checking submission…</p>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button className={navigationButton} disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
            <button className={navigationButton} disabled={index === attempt.questions.length - 1} onClick={() => setIndex(index + 1)}>Next</button>
            <button className="button sm:ml-auto" disabled={!!busy || timeUp}
              onClick={() => confirmation.current.showModal()}>{busy === 'submit' ? 'Submitting…' : 'Submit quiz'}</button>
          </div>
        </section>
        <nav className="card attempt-nav space-y-3" aria-label="Question navigation">
          <h2 className="font-semibold">Questions</h2>
          <p className="text-sm text-muted">{answered} of {attempt.questions.length} answered</p>
          <progress className="progress" max={attempt.questions.length} value={answered} aria-label="Questions answered" />
          <div className="flex flex-wrap gap-2">
            {attempt.questions.map(({ id }, number) => (
              <button className="question-jump px-3 py-2 text-sm" data-answered={Boolean(attempt.answers[id])}
                aria-label={`Question ${number + 1}, ${attempt.answers[id] ? 'answered' : 'unanswered'}`}
                aria-current={index === number ? 'step' : undefined} key={id} onClick={() => setIndex(number)}>{number + 1}</button>
            ))}
          </div>
        </nav>
      </div>
      <dialog className="submit-dialog" ref={confirmation} aria-labelledby="submit-title" aria-describedby="submit-description">
        <h2 id="submit-title" className="text-xl font-semibold">Submit this quiz?</h2>
        <p id="submit-description" className="mt-2 text-muted">
          {unanswered > 0 ? `${unanswered} ${unanswered === 1 ? 'question is' : 'questions are'} unanswered. ` : 'All questions are answered. '}
          Submitting finalizes your saved answers.
        </p>
        <form method="dialog" className="mt-5 flex flex-wrap justify-end gap-2">
          <button className="button-secondary" autoFocus>Keep working</button>
          <button type="button" className="button" disabled={!!busy || timeUp} onClick={() => {
            confirmation.current.close();
            void submit(false);
          }}>Confirm submission</button>
        </form>
      </dialog>
    </div>
  );
}
