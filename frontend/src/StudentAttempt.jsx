import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { requestError, RequestStatus } from './StudentQuizzes.jsx';

const navigationButton = 'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50';

function formatTime(totalSeconds) {
  return Math.floor(totalSeconds / 60) + ':' + String(totalSeconds % 60).padStart(2, '0');
}

function SubmissionSummary({ attempt }) {
  const { summary } = attempt;
  return (
    <section className="card max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold">{attempt.status === 'TIMED_OUT' ? 'Time expired. Quiz submitted.' : 'Quiz submitted successfully'}</h1>
      <p className="break-words font-medium">{attempt.quizTitle}</p>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Object.entries({
          Score: summary.percentage + '%', Result: summary.passed ? 'Passed' : 'Failed',
          Correct: summary.correctCount, Incorrect: summary.incorrectCount, Unanswered: summary.unansweredCount,
          'Time taken': formatTime(summary.elapsedSeconds),
        }).map(([name, value]) => <div key={name}><dt className="text-sm text-slate-600">{name}</dt><dd className="font-semibold">{value}</dd></div>)}
      </dl>
      <Link to="/student">Return to dashboard</Link>
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
    window.addEventListener('focus', updateTime);
    return () => {
      window.clearInterval(ticker);
      window.removeEventListener('focus', updateTime);
    };
  }, [active]);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-semibold">{attempt.quizTitle}</h1>
        <p className="rounded-md border border-slate-200 bg-white px-3 py-2 font-medium tabular-nums" role="timer">
          Time remaining: {formatTime(seconds)}
        </p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <section className="card min-w-0 space-y-4">
          <p className="text-sm text-slate-600">Question {index + 1} of {attempt.questions.length}</p>
          <fieldset className="space-y-2" disabled={!!busy || timeUp}>
            <legend className="mb-3 break-words font-medium">{question.text}</legend>
            {question.options.map((option) => (
              <label key={option.id} className="flex items-start gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50">
                <input type="radio" className="radio mt-1 shrink-0" name="quiz-answer" checked={attempt.answers[question.id] === option.id}
                  onChange={() => save(option.id)} />
                <span className="min-w-0 break-words">{option.text}</span>
              </label>
            ))}
          </fieldset>
          {busy === 'save' && <p role="status" className="text-sm">Saving answer…</p>}
          {timeUp && <p role="status" className="text-sm">Time is up. Checking submission…</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className={navigationButton} disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
            <button className={navigationButton} disabled={index === attempt.questions.length - 1} onClick={() => setIndex(index + 1)}>Next</button>
            <button className="button" disabled={!!busy || timeUp} onClick={() => {
              if (window.confirm('Submit this quiz? Your saved answers will be finalized.')) void submit(false);
            }}>{busy === 'submit' ? 'Submitting…' : 'Submit quiz'}</button>
          </div>
        </section>
        <nav className="card space-y-3" aria-label="Question navigation">
          <h2 className="font-semibold">Questions</h2>
          <p className="text-sm text-slate-600">{Object.keys(attempt.answers).length} of {attempt.questions.length} answered</p>
          <div className="flex flex-wrap gap-2">
            {attempt.questions.map(({ id }, number) => (
              <button className={'rounded-md border px-3 py-2 text-sm ' + (attempt.answers[id] ? 'border-teal-500 bg-teal-50 text-teal-900' : 'border-slate-300 bg-white')
                + (index === number ? ' outline-2 outline-offset-1 outline-blue-700' : '')}
                aria-label={`Question ${number + 1}, ${attempt.answers[id] ? 'answered' : 'unanswered'}`}
                aria-current={index === number ? 'step' : undefined} key={id} onClick={() => setIndex(number)}>{number + 1}</button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
