import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PlatformStats } from './Reporting.jsx';
import { loadRequest } from './load-request.js';
import { Badge, EmptyState, Icon, LoadingState, PageHeading, QuickActions, useToast } from './ui.jsx';

export function useRequest(api, path, params) {
  const key = JSON.stringify([path, params]);
  const [entry, setEntry] = useState(null);
  const state = entry?.key === key ? entry.state : {};
  function setState(state) {
    setEntry({ key, state });
  }

  useEffect(() => {
    const controller = new AbortController();
    setEntry(null);
    void loadRequest(
      () => api.get(path, { params: params ? new URLSearchParams(params) : undefined, signal: controller.signal }),
      controller.signal,
      (state) => setEntry({ key, state }),
    );
    return () => controller.abort();
  }, [api, path, params, key]);
  return [state, setState];
}

function loading({ error }) {
  return <LoadingState error={error} />;
}

export function AdminSummary({ api }) {
  const [state] = useRequest(api, '/admin/dashboard');
  return (
    <div className="space-y-6">
      <div className="dashboard-heading"><PageHeading title="Admin dashboard" description="Manage students and assessments, and track performance across the platform." /></div>
      <QuickActions items={[
        ['Create Quiz', '/admin/quizzes/new', 'plus'],
        ['Manage Categories', '/admin/categories', 'category'],
        ['View Students', '/admin/students', 'students'],
        ['Open Analytics', '/admin/analytics', 'chart'],
      ]} />
      {state.data ? <PlatformStats stats={state.data} /> : loading(state)}
      <RecentActivity api={api} />
    </div>
  );
}

const registrationDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function RecentActivity({ api }) {
  const [state] = useRequest(api, '/users');
  const recent = state.data?.users.slice(0, 3);
  return <section className="card space-y-3" aria-labelledby="activity-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="activity-title" className="flex items-center gap-2 text-lg font-semibold">
        <Icon name="clock" />Recent activity
      </h2>
      <Link className="text-sm" to="/admin/students">Student directory</Link>
    </div>
    {recent ? recent.length ? <ul aria-label="Recent student registrations">
      {recent.map((user) => <li className="activity-row" key={user.id}>
        <p><Link to={'/admin/students/' + user.id} className="font-semibold">{user.name}</Link> <span className="text-muted">registered</span></p>
        <time dateTime={user.createdAt}>{registrationDate.format(new Date(user.createdAt))}</time>
      </li>)}
    </ul> : <EmptyState icon="students">Recent registrations will appear after students sign up.</EmptyState> : loading(state)}
  </section>;
}

function accountStatus(user) {
  if (user.archivedAt) return 'Archived';
  return user.active ? 'Active' : 'Deactivated';
}

export function StudentList({ api }) {
  const [params, setParams] = useSearchParams();
  const [state] = useRequest(api, '/users', params.toString());
  const search = params.get('search') ?? '';
  const page = Number(params.get('page') ?? 1);
  return (
    <>
      <PageHeading title="Students" description="Find student accounts, manage access, and review attempt history." />
      <form key={search} className="card my-5 flex max-w-xl flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get('search').trim();
        setParams(value ? { search: value } : {});
      }}>
        <label className="flex-1 text-sm font-medium">Search by name or email
          <input name="search" defaultValue={search} maxLength={100} />
        </label>
        <button className="button">Search</button>
      </form>
      {!state.data ? loading(state) : (
        <>
          {state.data.users.length ? (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Student records">
              <table className="w-full text-left text-sm">
                <thead className="bg-subtle"><tr>{['Name', 'Email', 'Status'].map((label) => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
                <tbody>{state.data.users.map((user) => (
                  <tr key={user.id} className="border-t border-line">
                    <td className="p-3"><Link to={user.id}>{user.name}</Link></td>
                    <td className="p-3">{user.email}</td>
                    <td className="p-3"><Badge>{accountStatus(user)}</Badge></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState icon="students">{search ? "No students match your search." : page > 1 ? "No students found on this page." : "No students have registered yet."}</EmptyState>}
          <nav className="mt-4 flex flex-wrap items-center gap-4 text-sm" aria-label="Student pages">
            {page > 1 && <button className="button" onClick={() => setParams({ search, page: page - 1 })}>Previous</button>}
            <span>Page {page} · {state.data.total} students</span>
            {page * state.data.pageSize < state.data.total && <button className="button" onClick={() => setParams({ search, page: page + 1 })}>Next</button>}
          </nav>
        </>
      )}
    </>
  );
}

export function StudentProfile({ api }) {
  const { id } = useParams();
  const path = '/users/' + id;
  const [state, setState] = useRequest(api, path);
  const [saving, setSaving] = useState(false);
  const notify = useToast();
  if (!state.data) return loading(state);
  const { user } = state.data;
  async function updateStatus(archive = false) {
    if (archive && !window.confirm('Archive this account? The student will lose access and their attempt history will be retained.')) return;
    setSaving(true);
    try {
      const { data } = archive
        ? await api.delete(path)
        : await api.patch(path + '/status', { active: !user.active });
      setState({ data });
      notify(archive ? "Student archived." : "Student status updated.");
    } catch (error) {
      const message = error.response?.data?.message ?? 'Could not update the account.';
      notify(message, true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Link className="text-sm" to="/admin/students">All students</Link>
      <div className="mt-3"><PageHeading title={user.name} /></div>
      <dl className="card mt-5 max-w-lg space-y-3">
        <div><dt className="text-sm text-muted">Email</dt><dd>{user.email}</dd></div>
        <div><dt className="text-sm text-muted">Registered</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd></div>
        <div><dt className="text-sm text-muted">Status</dt><dd aria-live="polite"><Badge>{accountStatus(user)}</Badge></dd></div>
      </dl>
      {!user.archivedAt && (
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="button" onClick={() => updateStatus()} disabled={saving}>{saving ? 'Updating…' : user.active ? 'Deactivate account' : 'Activate account'}</button>
          <button className="button-secondary" onClick={() => updateStatus(true)} disabled={saving}>Archive account</button>
        </div>
      )}
      <AttemptHistory api={api} path={path} />
    </>
  );
}

function AttemptHistory({ api, path }) {
  const [page, setPage] = useState(1);
  const [state] = useRequest(api, path + '/attempts', 'page=' + page);
  return (
    <section className="mt-8" aria-labelledby="attempt-history">
      <h2 id="attempt-history" className="mb-4 text-xl font-semibold">Attempt history</h2>
      {!state.data ? loading(state) : (
        <>
          {state.data.attempts.length ? (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Student records">
              <table className="w-full text-left text-sm">
                <thead className="bg-subtle">
                  <tr>{['Quiz', 'Completed', 'Score', 'Result'].map((label) => <th key={label} scope="col" className="p-3">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {state.data.attempts.map((attempt) => (
                    <tr key={attempt.id} className="border-t border-line">
                      <td className="p-3"><Link to={'/admin/attempts/' + attempt.id + '/result'}>{attempt.quizTitle}</Link></td>
                      <td className="p-3">{new Date(attempt.finalizedAt).toLocaleString()}</td>
                      <td className="p-3">{attempt.score}%</td>
                      <td className="p-3"><Badge>{attempt.passed ? 'Passed' : 'Failed'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon="clock">Completed quiz attempts will appear here.</EmptyState>}
          {state.data.total > state.data.pageSize && (
            <nav className="mt-4 flex items-center gap-4 text-sm" aria-label="Attempt history pages">
              <button className="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} of {Math.ceil(state.data.total / state.data.pageSize)}</span>
              <button className="button" disabled={page * state.data.pageSize >= state.data.total} onClick={() => setPage(page + 1)}>Next</button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
