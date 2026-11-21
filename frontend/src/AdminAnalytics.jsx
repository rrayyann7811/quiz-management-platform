import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRequest } from './Admin.jsx';
import { PageHeading } from './ui.jsx';
import { RequestStatus } from './StudentQuizzes.jsx';
import { formatPercent, PageControls, PlatformStats, ReportTable } from './Reporting.jsx';

const AnalyticsCharts = lazy(() => import('./AnalyticsCharts.jsx'));
const quizTitle = (row) => <>{row.title}{row.archived && <small className="ml-2 text-muted">Archived</small>}</>;
const starts = ['Starts', (row) => row.totalAttempts];
const completed = ['Completed', (row) => row.completedAttempts];
const average = ['Average score', (row) => formatPercent(row.averageScore)];
const passRate = ['Pass rate', (row) => row.completedAttempts ? formatPercent(row.passPercentage) : '—'];
const quizColumns = [
  ['Quiz', quizTitle], ['Current category', (row) => row.category], completed, average,
  ['Highest', (row) => formatPercent(row.highestScore)], ['Passed', (row) => row.passedAttempts],
  ['Failed', (row) => row.failedAttempts], passRate,
];
const popularityColumns = [['Quiz', quizTitle], ['Current category', (row) => row.category], starts, completed, average];
const categoryColumns = [
  ['Category', (row) => row.name], ['Current quizzes', (row) => row.quizCount], starts, completed, average, passRate,
];

function AnalyticsFilters({ initial, onApply }) {
  const [fields, setFields] = useState(initial);

  function change(event) {
    const { name, value } = event.target;
    setFields((current) => ({ ...current, [name]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onApply(new URLSearchParams(fields));
  }

  return (
    <form className="card grid gap-3 sm:grid-cols-2 xl:grid-cols-5" onSubmit={submit}>
      <div><label className="text-sm" htmlFor="analytics-from">From (UTC)</label><input id="analytics-from" name="from" type="date" value={fields.from} onChange={change} required /></div>
      <div><label className="text-sm" htmlFor="analytics-to">To (UTC)</label><input id="analytics-to" name="to" type="date" value={fields.to} onChange={change} required /></div>
      <div><label className="text-sm" htmlFor="analytics-group">Group by</label><select id="analytics-group" name="group" value={fields.group} onChange={change}>
        <option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option>
      </select></div>
      <div><label className="text-sm" htmlFor="analytics-limit">Rows per report</label><select id="analytics-limit" name="limit" value={fields.limit} onChange={change}>
        <option value="10">10</option><option value="25">25</option><option value="50">50</option>
      </select></div>
      <div className="flex items-end"><button className="button">Apply filters</button></div>
    </form>
  );
}

export function AdminAnalytics({ api }) {
  const [params, setParams] = useSearchParams();
  const [state] = useRequest(api, '/admin/analytics', params.toString());
  const data = state.data;
  const to = params.get('to') || new Date().toISOString().slice(0, 10);
  const parsedTo = Date.parse(to);
  const defaultFrom = new Date((Number.isNaN(parsedTo) ? Date.now() : parsedTo) - 29 * 86_400_000).toISOString().slice(0, 10);
  const from = params.get('from') || defaultFrom;
  const group = params.get('group') || 'day';

  function paginate(key, page) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(key, page);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeading title="Analytics" description="Explore quiz activity, score trends, and performance by assessment or category." />
      <AnalyticsFilters key={`${from}:${to}:${group}:${params.get('limit')}`}
        initial={{ from, to, group, limit: params.get('limit') ?? '10' }} onApply={setParams} />
      {!data ? <RequestStatus error={state.error} /> : (
        <>
          <section className="space-y-3" aria-labelledby="platform-overview">
            <h2 id="platform-overview" className="text-xl font-semibold">Platform overview</h2>
            <p className="text-sm text-muted">All-time totals. Current inventory excludes archived quizzes.</p>
            <PlatformStats stats={data.platform} />
          </section>
          <Suspense fallback={<p role="status">Loading charts…</p>}>
            <AnalyticsCharts data={data} />
          </Suspense>
          <section className="space-y-3" aria-labelledby="quiz-performance">
            <h2 id="quiz-performance" className="text-xl font-semibold">Quiz performance</h2>
            <ReportTable columns={quizColumns} rows={data.quizPerformance.rows} empty="No quizzes in this report." />
            <PageControls name="Quiz performance pages" page={data.quizPerformance.page} hasMore={data.quizPerformance.hasMore}
              onChange={(page) => paginate('quizPage', page)} />
          </section>
          <section className="space-y-3" aria-labelledby="quiz-popularity">
            <h2 id="quiz-popularity" className="text-xl font-semibold">Most popular quizzes</h2>
            <ReportTable columns={popularityColumns} rows={data.quizPopularity} empty="No quiz starts in this date range." />
          </section>
          <section className="space-y-3" aria-labelledby="category-performance">
            <h2 id="category-performance" className="text-xl font-semibold">Category performance</h2>
            <p className="text-sm text-muted">Attempts are grouped by their category at start. Current quiz counts use today’s inventory.</p>
            <ReportTable columns={categoryColumns} rows={data.categoryPerformance.rows} empty="No categories in this report." />
            <PageControls name="Category performance pages" page={data.categoryPerformance.page} hasMore={data.categoryPerformance.hasMore}
              onChange={(page) => paginate('categoryPage', page)} />
          </section>
        </>
      )}
    </div>
  );
}
