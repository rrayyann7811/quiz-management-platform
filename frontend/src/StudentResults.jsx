import { lazy, Suspense } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useRequest } from './Admin.jsx';
import { RequestStatus } from './StudentQuizzes.jsx';
import { MetricGrid } from './Reporting.jsx';
import { Badge, EmptyState, PageHeading, QuickActions } from './ui.jsx';

const ScoreTrend = lazy(() => import('./ScoreTrend.jsx'));

const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const percent = (value) => value === null ? '—' : value + '%';
const duration = (value) => value === null ? '—' : Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
const resultPath = (id) => '/student/attempts/' + id + '/result';

function Outcome({ passed }) {
  return <Badge>{passed ? "Passed" : "Failed"}</Badge>;
}

function AttemptTable({ attempts, showTime = false }) {
  if (!attempts.length) return <EmptyState icon="clock">Completed quiz attempts will appear here.</EmptyState>;
  const columns = ['Quiz', 'Completed', 'Score', 'Result', ...(showTime ? ['Time taken'] : []), 'Details'];
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Completed attempts">
      <table className="attempt-table w-full text-left text-sm" role="table">
        <thead className="bg-slate-100" role="rowgroup"><tr role="row">{columns.map((label) => <th key={label} role="columnheader" scope="col" className="p-3">{label}</th>)}</tr></thead>
        <tbody role="rowgroup">{attempts.map((attempt) => (
          <tr key={attempt.id} className="border-t border-slate-200" role="row">
            <th className="attempt-title p-3 text-left font-semibold" role="rowheader" scope="row">{attempt.quizTitle}</th>
            <td className="p-3 whitespace-nowrap" role="cell"><span className="attempt-cell-label" aria-hidden="true">Completed</span>{date.format(new Date(attempt.finalizedAt))}</td>
            <td className="p-3" role="cell"><span className="attempt-cell-label" aria-hidden="true">Score</span>{percent(attempt.percentage)}</td>
            <td className="p-3" role="cell"><span className="attempt-cell-label" aria-hidden="true">Result</span><Outcome passed={attempt.passed} /></td>
            {showTime && <td className="p-3" role="cell"><span className="attempt-cell-label" aria-hidden="true">Time taken</span>{duration(attempt.elapsedSeconds)}</td>}
            <td className="attempt-link p-3 whitespace-nowrap" role="cell"><Link to={resultPath(attempt.id)} aria-label={'View result for ' + attempt.quizTitle}>View result</Link></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function StudentHome({ api, user }) {
  const [state] = useRequest(api, '/student/dashboard');
  const dashboard = state.data;
  return (
    <div className="space-y-6">
      <PageHeading title="Student dashboard" description={<>Welcome, <strong>{user.name}</strong>. Review your progress or start a quiz.</>} />
      <QuickActions items={[
        ['Browse quizzes', '/student/quizzes', 'book'],
        ['View history', '/student/attempts', 'clock'],
        ['Open leaderboard', '/student/leaderboard', 'trophy'],
      ]} />
      {!dashboard ? <RequestStatus error={state.error} /> : (
        <>
          <section aria-label="Performance statistics">
            <h2 className="mb-3 text-lg font-semibold">Performance overview</h2>
            <MetricGrid entries={[
              ['Total attempts', dashboard.stats.totalAttempts], ['Average score', percent(dashboard.stats.averageScore)],
              ['Highest score', percent(dashboard.stats.highestScore)], ['Passed', dashboard.stats.passedAttempts],
              ['Failed', dashboard.stats.failedAttempts], ['Questions answered', dashboard.stats.answeredQuestions],
            ]} />
            {dashboard.stats.missingQuestionCounts > 0 && <p className="mt-2 text-sm text-slate-600">
              Questions answered excludes {dashboard.stats.missingQuestionCounts} {dashboard.stats.missingQuestionCounts === 1 ? 'earlier attempt' : 'earlier attempts'} without question counts.
            </p>}
          </section>
          <section className="space-y-3" aria-labelledby="active-attempts">
            <h2 id="active-attempts" className="text-lg font-semibold">In-progress quizzes</h2>
            {dashboard.activeAttempts.length ? <ul className="space-y-2">
              {dashboard.activeAttempts.map(({ id, quizTitle }) => <li key={id} className="card flex flex-wrap items-center justify-between gap-3">
                <span className="break-words font-medium">{quizTitle}</span>
                <Link to={'/student/attempts/' + id}>Continue quiz<span className="sr-only"> {quizTitle}</span></Link>
              </li>)}
            </ul> : <EmptyState action={<Link to="/student/quizzes">Find a quiz</Link>}>You have no in-progress quizzes.</EmptyState>}
          </section>
          <section className="space-y-3" aria-labelledby="recent-attempts">
            <h2 id="recent-attempts" className="text-lg font-semibold">Recent attempts</h2>
            <AttemptTable attempts={dashboard.recentAttempts} />
          </section>
          <section className="card min-w-0 space-y-3" aria-labelledby="score-trend">
            <h2 id="score-trend" className="text-lg font-semibold">Score trend over time</h2>
            {dashboard.scoreTrend.length ? (
              <Suspense fallback={<p role="status" className="text-sm">Loading score trend…</p>}>
                <ScoreTrend entries={dashboard.scoreTrend} />
              </Suspense>
            ) : <EmptyState icon="chart">Complete a quiz to see your score trend.</EmptyState>}
          </section>
        </>
      )}
    </div>
  );
}

export function StudentHistory({ api }) {
  const [params, setParams] = useSearchParams();
  const page = params.get('page') ?? '1';
  const [state] = useRequest(api, '/attempts', new URLSearchParams({ page }).toString());
  const data = state.data;
  return (
    <div className="space-y-4">
      <PageHeading title="Attempt history" description="Review completed quizzes, scores, and individual results." />
      <Link to="/student">Back to dashboard</Link>
      {!data ? <RequestStatus error={state.error} /> : (
        <>
          <AttemptTable attempts={data.attempts} showTime />
          {(data.total > data.pageSize || data.page > 1) && <nav className="flex flex-wrap items-center gap-4 text-sm" aria-label="Attempt history pages">
            <button className="button" disabled={data.page === 1} onClick={() => setParams({ page: data.page - 1 })}>Previous</button>
            <span>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
            <button className="button" disabled={data.page * data.pageSize >= data.total} onClick={() => setParams({ page: data.page + 1 })}>Next</button>
          </nav>}
        </>
      )}
    </div>
  );
}

const answerStatuses = { CORRECT: 'Correct', INCORRECT: 'Incorrect', UNANSWERED: 'Unanswered' };

function AnswerReview({ questions }) {
  if (!questions) return <p className="card">Question-by-question review is not available for this earlier attempt.</p>;
  return (
    <ol className="space-y-4">
      {questions.map((question) => {
        const selected = question.options.find(({ id }) => id === question.selectedOptionId);
        const correct = question.options.find(({ id }) => id === question.correctOptionId);
        return (
          <li className="card space-y-3 break-words" key={question.number}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Question {question.number}</h2><Badge>{answerStatuses[question.status]}</Badge></div>
            <p>{question.text}</p>
            <ul className="space-y-2 text-sm">
              {question.options.map(({ id, text }) => <li key={id} className={'review-option' + (id === question.correctOptionId ? ' review-correct' : id === question.selectedOptionId ? ' review-incorrect' : '')}>{text}
                {id === question.selectedOptionId && <span className="ml-2 text-slate-600">(Your answer)</span>}
                {id === question.correctOptionId && <span className="ml-2 font-medium text-emerald-800">(Correct answer)</span>}
              </li>)}
            </ul>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold">Your answer</dt><dd>{selected?.text ?? 'No answer selected'}</dd></div>
              <div><dt className="font-semibold">Correct answer</dt><dd>{correct.text}</dd></div>
              <div><dt className="font-semibold">Marks awarded</dt><dd>{question.awardedMarks} / {question.marks}</dd></div>
              <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2"><dt className="mb-1 font-semibold">Explanation</dt><dd className="whitespace-pre-wrap">{question.explanation}</dd></div>
            </dl>
          </li>
        );
      })}
    </ol>
  );
}

export function AttemptResult({ api, admin = false, review = false }) {
  const { attemptId } = useParams();
  const path = admin ? '/admin/attempts/' + attemptId + '/result' : '/attempts/' + attemptId + '/result';
  const [state] = useRequest(api, path);
  const data = state.data;
  if (!data) return (
    <div className="space-y-3">
      <Link to={admin ? '/admin/students' : '/student/attempts'}>{admin ? 'All students' : 'Attempt history'}</Link>
      <RequestStatus error={state.error} />
    </div>
  );

  const { result, student } = data;
  const base = admin ? '/admin/attempts/' + attemptId + '/result' : resultPath(attemptId);
  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="break-words text-2xl font-semibold">{review ? 'Answer review' : result.quizTitle}</h1>
        {review && <p className="mt-1 break-words font-medium">{result.quizTitle}</p>}
        {student && <p className="mt-1 text-sm text-slate-600">Student: {student.name}</p>}
        <p className="mt-1 text-sm text-slate-600">Completed {timestamp.format(new Date(result.finalizedAt))}
          {result.status === 'TIMED_OUT' && ' · Time expired'}</p>
      </div>
      {review ? <AnswerReview questions={result.review} /> : (
        <section className={'card space-y-5 ' + (result.passed ? 'result-pass' : 'result-fail')} aria-label="Result summary">
          <div className="flex flex-wrap items-center gap-3">
            <p className="result-score">{percent(result.percentage)}</p><Outcome passed={result.passed} />
          </div>
          {result.percentage != null && <progress className="progress" max={100} value={result.percentage} aria-label="Percentage score" />}
          {result.review ? (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {Object.entries({
                Questions: result.totalQuestions, Correct: result.correctCount, Incorrect: result.incorrectCount,
                Unanswered: result.unansweredCount, 'Marks obtained': result.obtainedMarks,
                'Maximum marks': result.maximumMarks, 'Time taken': duration(result.elapsedSeconds),
              }).map(([label, value]) => <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="font-semibold">{value}</dd></div>)}
            </dl>
          ) : <p>Question-by-question review is not available for this earlier attempt.</p>}
        </section>
      )}
      <nav className="flex flex-wrap items-center gap-4" aria-label="Result navigation">
        <Link to={review ? base : base + '/review'}>{review ? 'Back to result' : 'Review answers'}</Link>
        {admin ? <Link to={'/admin/students/' + student.id}>Back to student profile</Link> : <>
          <Link to="/student/attempts">Attempt history</Link><Link to="/student">Back to dashboard</Link>
        </>}
      </nav>
    </div>
  );
}
