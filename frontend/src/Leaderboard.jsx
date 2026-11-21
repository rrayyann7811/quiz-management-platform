import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRequest } from './Admin.jsx';
import { formatPercent, PageControls, ReportTable } from './Reporting.jsx';
import { RequestStatus, requestError } from './StudentQuizzes.jsx';
import { PageHeading, useToast } from './ui.jsx';

function Rankings({ api, params, onPage, admin, busy, setExcluded }) {
  const [state] = useRequest(api, '/leaderboard', params.toString());
  if (!state.data) return <RequestStatus error={state.error} />;
  const { entries, page, hasMore } = state.data;
  const columns = [
    ['Rank', (row) => <span className={'rank' + (row.rank === 1 ? ' rank-first' : row.rank <= 3 ? ' rank-top' : '')}>{row.rank}</span>], ['Student', (row) => row.displayName],
    ['Average best score', (row) => formatPercent(row.averageScore)],
    ['Highest score', (row) => formatPercent(row.highestScore)], ['Quizzes completed', (row) => row.quizzesCompleted],
  ];
  if (admin) columns.push(['Visibility', (row) => <button className="button" disabled={busy}
    aria-label={'Exclude ' + row.displayName}
    onClick={() => setExcluded(row.studentId, row.displayName, true)}>Exclude</button>]);
  return (
    <>
      <ReportTable columns={columns} rows={entries} empty="Rankings will appear after eligible students complete quizzes in this view." />
      <PageControls page={page} hasMore={hasMore} onChange={onPage} name="Leaderboard pages" />
    </>
  );
}

function Exclusions({ api, page, onPage, busy, setExcluded }) {
  const [state] = useRequest(api, '/admin/leaderboard/exclusions', 'page=' + page);
  if (!state.data) return <RequestStatus error={state.error} />;
  return (
    <>
      <ReportTable rows={state.data.students} empty="No students have been manually excluded." columns={[
        ['Student', (row) => row.name],
        ['Account', (row) => row.archivedAt ? 'Archived' : row.active ? 'Active' : 'Inactive'],
        ['Visibility', (row) => <button className="button" disabled={busy} aria-label={'Restore ' + row.name}
          onClick={() => setExcluded(row.id, row.name, false)}>Restore</button>],
      ]} />
      <PageControls page={state.data.page} hasMore={state.data.hasMore} onChange={onPage} name="Exclusion pages" />
    </>
  );
}

function RankingFilters({ initialCategory, initialPeriod, categories, onApply }) {
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [period, setPeriod] = useState(initialPeriod);

  function submit(event) {
    event.preventDefault();
    const next = new URLSearchParams({ period });
    if (categoryId) next.set('categoryId', categoryId);
    onApply(next);
  }

  return (
    <form className="card grid max-w-3xl gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={submit}>
      <div><label className="text-sm" htmlFor="leaderboard-category">Category</label>
        <select id="leaderboard-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">Overall</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>
      <div><label className="text-sm" htmlFor="leaderboard-period">Period</label>
        <select id="leaderboard-period" value={period} onChange={(event) => setPeriod(event.target.value)}>
          <option value="overall">All time</option><option value="weekly">This week</option><option value="monthly">This month</option>
        </select>
      </div>
      <div className="flex items-end"><button className="button">Apply filters</button></div>
    </form>
  );
}

export function Leaderboard({ api, admin = false }) {
  const [params, setParams] = useSearchParams();
  const [categoryState] = useRequest(api, '/leaderboard/categories');
  const [revision, setRevision] = useState(0);
  const [excludedPage, setExcludedPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const notify = useToast();

  async function setExcluded(id, name, excluded) {
    if (excluded && !window.confirm(`Exclude ${name} from leaderboards? Their results will be kept.`)) return;
    setBusy(true);
    try {
      await api.patch('/admin/leaderboard/exclusions/' + id, { excluded });
      notify(excluded ? `${name} was excluded.` : `Manual exclusion removed for ${name}.`);
      setRevision((value) => value + 1);
    } catch (error) {
      notify(requestError(error), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeading title={admin ? "Leaderboard management" : "Leaderboard"} description="Compare best assessment scores by category and time period." />
      <RankingFilters key={`${params.get('categoryId')}:${params.get('period')}`}
        initialCategory={params.get('categoryId') ?? ''} initialPeriod={params.get('period') ?? 'overall'}
        categories={categoryState.data?.categories ?? []} onApply={setParams} />
      {categoryState.error && <RequestStatus error={categoryState.error} />}
      <details className="card space-y-2 text-sm">
        <summary className="cursor-pointer font-medium">Ranking rules</summary>
        <p>Only active, eligible students appear. We take each student’s best finalized score per quiz and average those scores.</p>
        <p>Higher averages rank first, then more distinct quizzes, then the highest individual score. Identical metrics share a rank.</p>
        <p>Weeks start Monday and months start on the first, both at midnight UTC. Category rankings use the category at attempt start.</p>
      </details>
      <Rankings key={revision} {...{ api, params, admin, busy, setExcluded }} onPage={(page) => {
        const updated = new URLSearchParams(params);
        updated.set('page', page);
        setParams(updated);
      }} />
      {admin && (
        <section className="space-y-3" aria-labelledby="excluded-students">
          <h2 id="excluded-students" className="text-xl font-semibold">Manually excluded students</h2>
          <Exclusions key={revision} {...{ api, busy, setExcluded }} page={excludedPage} onPage={setExcludedPage} />
        </section>
      )}
    </div>
  );
}
