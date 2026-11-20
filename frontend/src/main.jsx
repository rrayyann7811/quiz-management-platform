import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import axios from 'axios';
import { AdminSummary, StudentList, StudentProfile } from './Admin.jsx';
import { Categories, NewQuiz, QuizEditor, QuizList } from './Authoring.jsx';
import { StudentQuizDetails, StudentQuizzes } from './StudentQuizzes.jsx';
import { StudentAttempt } from './StudentAttempt.jsx';
import { AttemptResult, StudentHistory, StudentHome } from './StudentResults.jsx';
import { AdminAnalytics } from './AdminAnalytics.jsx';
import { Leaderboard } from './Leaderboard.jsx';
import './style.css';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api', timeout: 15000 });
const sessionKey = 'quiz-session';
const forms = {
  login: { heading: 'Sign in', action: 'Sign in', fields: ['email', 'password'] },
  register: { heading: 'Create a student account', action: 'Create account', fields: ['name', 'email', 'password'] },
  'forgot-password': { heading: 'Forgot your password?', action: 'Send reset email', fields: ['email'] },
  'reset-password': { heading: 'Choose a new password', action: 'Reset password', fields: ['password'] },
};

function AuthForm({ mode, onLogin, onReset }) {
  const { heading, action, fields } = forms[mode];
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();
  const [feedback, setFeedback] = useState(null);
  const [resetAvailable, setResetAvailable] = useState(null);
  useEffect(() => {
    if (mode !== 'forgot-password') return;
    const controller = new AbortController();
    api.get('/auth/password-reset-status', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResetAvailable(data.available === true); })
      .catch(() => { if (!controller.signal.aborted) setResetAvailable(false); });
    return () => controller.abort();
  }, [mode]);
  const navigate = useNavigate();
  const { state, hash } = useLocation();
  const resetToken = mode === 'reset-password' ? new URLSearchParams(hash.slice(1)).get('token') : null;
  const linkMissing = mode === 'reset-password' && !resetToken;

  async function submit(values) {
    setFeedback(null);
    try {
      const body = mode === 'reset-password' ? { ...values, token: resetToken } : values;
      const { data } = await api.post('/auth/' + mode, body);
      if (mode === 'login') onLogin(data);
      else if (mode === 'forgot-password') setFeedback({ text: data.message });
      else {
        if (mode === 'reset-password') onReset();
        navigate('/login', { replace: mode === 'reset-password', state: { message: mode === 'register' ? 'Account created. You can now sign in.' : 'Password updated. You can now sign in.' } });
      }
    } catch (error) {
      setFeedback({ error: true, text: error.response?.data?.message ?? 'Could not reach the server. Try again.' });
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
      <section className="card w-full">
        <p className="mb-3 text-sm font-medium text-slate-600">Quiz Management &amp; Online Assessment Platform</p>
        <h1 className="mb-6 text-2xl font-semibold">{heading}</h1>
        {mode === 'forgot-password' && resetAvailable !== true ? (
          <p role="status">{resetAvailable === null ? 'Checking password reset availability…' : 'Email-based password reset is temporarily unavailable.'}</p>
        ) : linkMissing ? <p role="alert">Open a valid reset link or request a <Link to="/forgot-password">new reset email</Link>.</p> : (
          <form className="space-y-4" onSubmit={handleSubmit(submit)} noValidate>
            {fields.map((field) => (
              <label className="block text-sm font-medium" key={field}>
                {field === 'name' ? 'Full name' : field === 'email' ? 'Email address' : 'Password'}
                <input
                  type={field === 'name' ? 'text' : field}
                  autoComplete={field === 'password' ? (mode === 'login' ? 'current-password' : 'new-password') : field}
                  aria-invalid={Boolean(errors[field])}
                  {...register(field, {
                    required: 'This field is required.',
                    ...(field === 'email' && { pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address.' } }),
                    ...(field === 'password' && mode !== 'login' && { minLength: { value: 12, message: 'Use at least 12 characters.' } }),
                  })}
                />
                {errors[field] && <span className="text-red-700">{errors[field].message}</span>}
              </label>
            ))}
            {mode === 'login' && state?.message && <p role="status" className="text-teal-800">{state.message}</p>}
            {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'text-red-700' : 'text-teal-800'}>{feedback.text}</p>}
            <button className="button w-full" disabled={isSubmitting}>{isSubmitting ? 'Please wait…' : action}</button>
          </form>
        )}
        <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Account options">
          {mode !== 'login' && <Link to="/login">Sign in</Link>}
          {mode === 'login' && <><Link to="/register">Create student account</Link><Link to="/forgot-password">Forgot password?</Link></>}
        </nav>
      </section>
    </main>
  );
}

function Dashboard({ user, onLogout }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    setError('');
    try { await onLogout(); }
    catch { setError('Could not end the session. Try signing out again.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-b border-slate-200 bg-white p-5 md:border-r md:border-b-0">
        <p className="mb-5 font-semibold">Quiz Management</p>
        <nav className="flex flex-wrap gap-4 md:flex-col" aria-label="Dashboard">
          <Link to={user.role === 'ADMIN' ? '/admin' : '/student'}>Dashboard</Link>
          {user.role === 'STUDENT' && <>
            <Link to="/student/quizzes">Quizzes</Link>
            <Link to="/student/attempts">Attempt history</Link>
            <Link to="/student/leaderboard">Leaderboard</Link>
          </>}
          {user.role === 'ADMIN' && <>
            <Link to="/admin/students">Students</Link>
            <Link to="/admin/analytics">Analytics</Link>
            <Link to="/admin/leaderboard">Leaderboard management</Link>
            <Link to="/admin/categories">Categories</Link>
            <Link to="/admin/quizzes">Quizzes</Link>
          </>}
        </nav>
        <button className="button mt-6" onClick={logout} disabled={busy}>Sign out</button>
        {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
      </aside>
      <main className="min-w-0 p-5 md:p-10"><Outlet /></main>
    </div>
  );
}

function App() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(sessionKey);
    delete api.defaults.headers.common.Authorization;
    setUser(null);
  }, []);

  useEffect(() => {
    const interceptor = api.interceptors.response.use(undefined, (error) => {
      const token = sessionStorage.getItem(sessionKey);
      const sent = error.config?.headers?.get('Authorization');
      if (error.response?.status === 401 && token && sent === 'Bearer ' + token) clearSession();
      return Promise.reject(error);
    });
    return () => api.interceptors.response.eject(interceptor);
  }, [clearSession]);

  useEffect(() => {
    const token = sessionStorage.getItem(sessionKey);
    if (!token) {
      setStatus('ready');
      return;
    }
    api.defaults.headers.common.Authorization = 'Bearer ' + token;
    api.get('/auth/me').then(({ data }) => {
      setUser(data.user);
      setStatus('ready');
    }).catch((error) => {
      if (error.response?.status === 401) {
        clearSession();
        setStatus('ready');
      } else setStatus('offline');
    });
  }, [clearSession]);

  function login(data) {
    sessionStorage.setItem(sessionKey, data.token);
    api.defaults.headers.common.Authorization = 'Bearer ' + data.token;
    setUser(data.user);
  }

  async function logout() {
    try { await api.post('/auth/logout'); }
    catch (error) { if (error.response?.status !== 401) throw error; }
    clearSession();
  }

  if (status === 'loading') return <main className="p-8" role="status">Checking your session…</main>;
  if (status === 'offline') return <main className="p-8"><p role="alert">Could not verify your session.</p><button className="button mt-3" onClick={() => window.location.reload()}>Try again</button></main>;
  const home = user ? (user.role === 'ADMIN' ? '/admin' : '/student') : '/login';
  return (
    <Routes>
      {Object.keys(forms).map((mode) => (
        <Route key={mode} path={mode} element={user && mode !== 'reset-password' ? <Navigate to={home} replace /> : <AuthForm key={mode} mode={mode} onLogin={login} onReset={clearSession} />} />
      ))}
      <Route path="/admin" element={user?.role === 'ADMIN' ? <Dashboard user={user} onLogout={logout} /> : <Navigate to={home} replace />}>
        <Route index element={<><h1 className="text-2xl font-semibold">Admin dashboard</h1><AdminSummary api={api} /></>} />
        <Route path="analytics" element={<AdminAnalytics api={api} />} />
        <Route path="leaderboard" element={<Leaderboard api={api} admin />} />
        <Route path="categories" element={<Categories api={api} />} />
        <Route path="quizzes" element={<QuizList api={api} />} />
        <Route path="quizzes/new" element={<NewQuiz api={api} />} />
        <Route path="quizzes/:id" element={<QuizEditor key={location.pathname} api={api} />} />
        <Route path="students" element={<StudentList api={api} />} />
        <Route path="attempts/:attemptId/result" element={<AttemptResult key={location.pathname} api={api} admin />} />
        <Route path="attempts/:attemptId/result/review" element={<AttemptResult key={location.pathname} api={api} admin review />} />
        <Route path="students/:id" element={<StudentProfile key={location.pathname} api={api} />} />
      </Route>
      <Route path="/student" element={user?.role === 'STUDENT' ? <Dashboard user={user} onLogout={logout} /> : <Navigate to={home} replace />}>
        <Route index element={<StudentHome api={api} user={user} />} />
        <Route path="quizzes" element={<StudentQuizzes api={api} />} />
        <Route path="quizzes/:quizId" element={<StudentQuizDetails key={location.pathname} api={api} />} />
        <Route path="leaderboard" element={<Leaderboard api={api} />} />
        <Route path="attempts" element={<StudentHistory api={api} />} />
        <Route path="attempts/:attemptId/result" element={<AttemptResult key={location.pathname} api={api} />} />
        <Route path="attempts/:attemptId/result/review" element={<AttemptResult key={location.pathname} api={api} review />} />
        <Route path="attempts/:attemptId" element={<StudentAttempt key={location.pathname} api={api} />} />
      </Route>
      <Route path="/leaderboard" element={<Navigate to={user ? home + '/leaderboard' : '/login'} replace />} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>);
