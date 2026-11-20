import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PlatformStats } from './Reporting.jsx';
import { loadRequest } from './load-request.js';

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
  return error ? <p role="alert" className="text-red-700">{error}</p> : <p role="status">Loading…</p>;
}

export function AdminSummary({ api }) {
  const [state] = useRequest(api, '/admin/dashboard');
  if (!state.data) return loading(state);
  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-slate-600">All-time attempt statistics and current quiz inventory.</p>
      <PlatformStats stats={state.data} />
      <Link to="/admin/analytics">View analytics</Link>
    </div>
  );
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
      <h1 className="text-2xl font-semibold">Students</h1>
      <form key={search} className="my-5 flex max-w-lg items-end gap-3" onSubmit={(event) => {
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
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100"><tr>{['Name', 'Email', 'Status'].map((label) => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
                <tbody>{state.data.users.map((user) => (
                  <tr key={user.id} className="border-t border-slate-200">
                    <td className="p-3"><Link to={user.id}>{user.name}</Link></td>
                    <td className="p-3">{user.email}</td>
                    <td className="p-3">{accountStatus(user)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p>No students found on this page.</p>}
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
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!state.data) return loading(state);
  const { user } = state.data;
  async function updateStatus(archive = false) {
    if (archive && !window.confirm('Archive this account? The student will lose access and their attempt history will be retained.')) return;
    setError('');
    setSaving(true);
    try {
      const { data } = archive
        ? await api.delete(path)
        : await api.patch(path + '/status', { active: !user.active });
      setState({ data });
    } catch (error) {
      setError(error.response?.data?.message ?? 'Could not update the account.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Link className="text-sm" to="/admin/students">All students</Link>
      <h1 className="mt-3 text-2xl font-semibold">{user.name}</h1>
      <dl className="card mt-5 max-w-lg space-y-3">
        <div><dt className="text-sm text-slate-600">Email</dt><dd>{user.email}</dd></div>
        <div><dt className="text-sm text-slate-600">Registered</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd></div>
        <div><dt className="text-sm text-slate-600">Status</dt><dd aria-live="polite">{accountStatus(user)}</dd></div>
      </dl>
      {!user.archivedAt && (
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="button" onClick={() => updateStatus()} disabled={saving}>{user.active ? 'Deactivate account' : 'Activate account'}</button>
          <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-60" onClick={() => updateStatus(true)} disabled={saving}>Archive account</button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
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
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100">
                  <tr>{['Quiz', 'Completed', 'Score', 'Result'].map((label) => <th key={label} scope="col" className="p-3">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {state.data.attempts.map((attempt) => (
                    <tr key={attempt.id} className="border-t border-slate-200">
                      <td className="p-3"><Link to={'/admin/attempts/' + attempt.id + '/result'}>{attempt.quizTitle}</Link></td>
                      <td className="p-3">{new Date(attempt.finalizedAt).toLocaleString()}</td>
                      <td className="p-3">{attempt.score}%</td>
                      <td className="p-3">{attempt.passed ? 'Passed' : 'Failed'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>No completed attempts.</p>}
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
