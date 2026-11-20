import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useRequest } from './Admin.jsx';

const label = (value) => value[0] + value.slice(1).toLowerCase();
export const requestError = (error) => error.response?.data?.message ?? 'Could not reach the server. Try again.';

export function RequestStatus({ error }) {
  return error ? <p role="alert" className="text-red-700">{error}</p> : <p role="status">Loading…</p>;
}

function QuizFacts({ quiz }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-3">
      {Object.entries({
        Category: quiz.category.name, Difficulty: label(quiz.difficulty), Questions: quiz._count.questions,
        Duration: quiz.durationMinutes + ' min', 'Passing score': quiz.passingPercent + '%', 'Maximum attempts': quiz.maxAttempts,
      }).map(([name, value]) => (
        <div key={name}><dt className="text-slate-600">{name}</dt><dd className="font-medium">{value}</dd></div>
      ))}
    </dl>
  );
}

export function StudentHome({ api }) {
  const [state] = useRequest(api, '/attempts/active');
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Student dashboard</h1>
      <Link className="button inline-block" to="/student/quizzes">Browse quizzes</Link>
      <section className="space-y-3" aria-labelledby="active-attempts">
        <h2 id="active-attempts" className="text-lg font-semibold">In-progress quizzes</h2>
        {!state.data ? <RequestStatus error={state.error} /> : state.data.attempts.length ? (
          <ul className="space-y-2">
            {state.data.attempts.map(({ id, quizTitle }) => (
              <li key={id} className="card flex flex-wrap items-center justify-between gap-3">
                <span className="break-words font-medium">{quizTitle}</span>
                <Link to={'/student/attempts/' + id}>Continue quiz<span className="sr-only"> {quizTitle}</span></Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-600">You have no in-progress quizzes.</p>}
      </section>
    </div>
  );
}

export function StudentQuizzes({ api }) {
  const [params, setParams] = useSearchParams();
  const [categories] = useRequest(api, '/categories');
  const query = new URLSearchParams(params);
  if (!query.has('sort')) query.set('sort', 'recent');
  const [state] = useRequest(api, '/quizzes', query.toString());

  function filter(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const [key, value] of values) if (value.trim()) next.set(key, value.trim());
    setParams(next);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Browse quizzes</h1>
      <form className="card grid gap-3 sm:grid-cols-2 xl:grid-cols-3" key={query.toString()} onSubmit={filter}>
        <div><label htmlFor="student-search" className="text-sm">Search by title</label>
          <input id="student-search" name="search" maxLength={120} defaultValue={query.get('search') ?? ''} /></div>
        <div><label htmlFor="student-category" className="text-sm">Category</label>
          <select id="student-category" name="categoryId" defaultValue={query.get('categoryId') ?? ''}>
            <option value="">All categories</option>
            {categories.data?.categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select></div>
        <div><label htmlFor="student-difficulty" className="text-sm">Difficulty</label>
          <select id="student-difficulty" name="difficulty" defaultValue={query.get('difficulty') ?? ''}>
            <option value="">All levels</option>
            {['EASY', 'MEDIUM', 'HARD'].map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select></div>
        <div><label htmlFor="student-duration" className="text-sm">Maximum duration</label>
          <select id="student-duration" name="maxDuration" defaultValue={query.get('maxDuration') ?? ''}>
            <option value="">Any duration</option>
            {[10, 20, 30, 60, 120, 240].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
          </select></div>
        <div><label htmlFor="student-sort" className="text-sm">Sort by</label>
          <select id="student-sort" name="sort" defaultValue={query.get('sort')}>
            <option value="recent">Recently added</option><option value="title">Title</option>
          </select></div>
        <div className="flex items-end gap-3"><button className="button">Apply filters</button>
          {params.size > 0 && <Link className="py-2 text-sm" to="/student/quizzes">Clear filters</Link>}</div>
        {categories.error && <p role="alert" className="text-sm text-red-700">{categories.error}</p>}
      </form>
      {!state.data ? <RequestStatus error={state.error} /> : state.data.quizzes.length ? (
        <ul className="grid gap-4 lg:grid-cols-2">
          {state.data.quizzes.map((quiz) => (
            <li key={quiz.id} className="card space-y-3">
              <h2 className="break-words text-lg font-semibold"><Link to={'/student/quizzes/' + quiz.id}>{quiz.title}</Link></h2>
              <p className="break-words text-sm text-slate-700">{quiz.description}</p>
              <QuizFacts quiz={quiz} />
            </li>
          ))}
        </ul>
      ) : <p>No published quizzes match your filters.</p>}
    </div>
  );
}

export function StudentQuizDetails({ api }) {
  const { quizId } = useParams();
  const path = '/quizzes/' + quizId;
  const [state] = useRequest(api, path);
  const [availability] = useRequest(api, path + '/eligibility');
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(path + '/start', {});
      navigate('/student/attempts/' + data.attempt.id);
    } catch (error) {
      setError(requestError(error));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/student/quizzes">All quizzes</Link>
      {!state.data ? <RequestStatus error={state.error} /> : (
        <>
          <h1 className="break-words text-2xl font-semibold">{state.data.quiz.title}</h1>
          <section className="card max-w-3xl space-y-4">
            <p className="whitespace-pre-wrap break-words">{state.data.quiz.description}</p>
            <QuizFacts quiz={state.data.quiz} />
            {!availability.data ? <RequestStatus error={availability.error} /> : (
              <>
                <p className="text-sm">Remaining attempts: <strong>{availability.data.remainingAttempts}</strong></p>
                {availability.data.activeAttemptId ? (
                  <Link className="button inline-block" to={'/student/attempts/' + availability.data.activeAttemptId}>Continue quiz</Link>
                ) : (
                  <div className="space-y-2">
                    <button className="button" disabled={busy || !availability.data.remainingAttempts} onClick={start}>
                      {busy ? 'Starting…' : 'Start quiz'}
                    </button>
                    {!availability.data.remainingAttempts && <p className="text-sm">You have used all allowed attempts.</p>}
                  </div>
                )}
              </>
            )}
            {error && <p role="alert" className="text-red-700">{error}</p>}
          </section>
        </>
      )}
    </div>
  );
}
