import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

function useRequest(api, path, params) {
  const [state, setState] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    setState({});
    api.get(path, { params: params ? new URLSearchParams(params) : undefined, signal: controller.signal })
      .then(({ data }) => setState({ data }))
      .catch((error) => {
        if (!controller.signal.aborted) setState({ error: error.response?.data?.message ?? 'Could not reach the server.' });
      });
    return () => controller.abort();
  }, [api, path, params]);
  return [state, setState];
}

function loading({ error }) {
  return error ? <p role="alert" className="text-red-700">{error}</p> : <p role="status">Loading…</p>;
}

export function AdminSummary({ api }) {
  const [state] = useRequest(api, '/admin/dashboard');
  if (!state.data) return loading(state);
  return (
    <dl className="mt-6 grid gap-4 sm:grid-cols-3">
      {Object.entries({ total: 'Total students', active: 'Active accounts', inactive: 'Deactivated accounts' }).map(([key, label]) => (
        <div className="card" key={key}>
          <dt className="text-sm text-slate-600">{label}</dt>
          <dd className="mt-2 text-2xl font-semibold">{state.data[key]}</dd>
        </div>
      ))}
    </dl>
  );
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
                    <td className="p-3">{user.active ? 'Active' : 'Deactivated'}</td>
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
  async function updateStatus() {
    setError('');
    setSaving(true);
    try {
      const { data } = await api.patch(path + '/status', { active: !user.active });
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
        <div><dt className="text-sm text-slate-600">Status</dt><dd aria-live="polite">{user.active ? 'Active' : 'Deactivated'}</dd></div>
      </dl>
      <button className="button mt-5" onClick={updateStatus} disabled={saving}>{user.active ? 'Deactivate account' : 'Activate account'}</button>
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    </>
  );
}
