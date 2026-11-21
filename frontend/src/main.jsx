import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import axios from 'axios';
import { AdminSummary, StudentList, StudentProfile } from './Admin.jsx';
import { Categories, NewQuiz, QuizEditor, QuizList } from './Authoring.jsx';
import { StudentQuizDetails, StudentQuizzes } from './StudentQuizzes.jsx';
import { StudentAttempt } from './StudentAttempt.jsx';
import { AttemptResult, StudentHistory, StudentHome } from './StudentResults.jsx';
import { AdminAnalytics } from './AdminAnalytics.jsx';
import { Leaderboard } from './Leaderboard.jsx';
import { Icon, ToastProvider } from './ui.jsx';
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
    <main className="auth-layout">
      <section className="auth-brand">
        <Brand />
        <div><h2>Online assessment platform</h2>
          <p>Find your quizzes, take timed assessments, and review your results in one place.</p></div>
      </section>
      <section className="auth-content">
        <h1 className="mb-6">{heading}</h1>
        {mode === 'forgot-password' && resetAvailable !== true ? (
          <p role="status">{resetAvailable === null ? 'Checking password reset availability…' : 'Email-based password reset is temporarily unavailable.'}</p>
        ) : linkMissing ? <p role="alert">Open a valid reset link or request a <Link to="/forgot-password">new reset email</Link>.</p> : (
          <form className="space-y-4" onSubmit={handleSubmit(submit)} noValidate>
            {fields.map((field) => (
              <div className="text-sm" key={field}>
                <label htmlFor={`auth-${field}`}>{field === 'name' ? 'Full name' : field === 'email' ? 'Email address' : 'Password'}</label>
                <input
                  id={`auth-${field}`}
                  type={field === 'name' ? 'text' : field}
                  autoComplete={field === 'password' ? (mode === 'login' ? 'current-password' : 'new-password') : field}
                  aria-invalid={Boolean(errors[field])}
                  aria-describedby={errors[field] ? `auth-${field}-error` : undefined}
                  {...register(field, {
                    required: 'This field is required.',
                    ...(field === 'email' && { pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address.' } }),
                    ...(field === 'password' && mode !== 'login' && { minLength: { value: 12, message: 'Use at least 12 characters.' } }),
                  })}
                />
                {errors[field] && <span id={`auth-${field}-error`} className="mt-1 block text-danger">{errors[field].message}</span>}
              </div>
            ))}
            {mode === 'login' && state?.message && <p role="status" className="text-positive">{state.message}</p>}
            {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'text-danger' : 'text-positive'}>{feedback.text}</p>}
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

const adminLinks = [
  ['/admin', 'Dashboard', 'dashboard'], ['/admin/students', 'Students', 'students'],
  ['/admin/quizzes', 'Quizzes', 'book'], ['/admin/categories', 'Categories', 'category'],
  ['/admin/analytics', 'Analytics', 'chart'], ['/admin/leaderboard', 'Leaderboard management', 'trophy'],
];
const studentLinks = [
  ['/student', 'Dashboard', 'dashboard'], ['/student/quizzes', 'Quizzes', 'book'],
  ['/student/attempts', 'Attempt history', 'clock'], ['/student/leaderboard', 'Leaderboard', 'trophy'],
];

function Brand() {
  return <div className="brand"><span className="brand-mark"><Icon name="book" size={22} /></span>
    <span className="brand-text">Quiz Management</span></div>;
}

function Dashboard({ user, onLogout }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('quiz-sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const admin = user.role === 'ADMIN';
  const links = admin ? adminLinks : studentLinks;
  const [home] = links[0];
  const current = links.find(([to]) => pathname === to || (to !== home && pathname.startsWith(to + '/')));
  const parent = current ?? (pathname.startsWith('/admin/attempts/') ? adminLinks[1] : null);
  const detail = pathname.endsWith('/review') ? 'Answer review'
    : pathname.endsWith('/result') ? 'Result'
    : pathname === '/admin/quizzes/new' ? 'Create quiz'
    : parent?.[0].endsWith('/quizzes') ? 'Quiz details'
    : parent?.[0].endsWith('/students') ? 'Student profile'
    : 'Quiz attempt';

  useEffect(() => {
    localStorage.setItem('quiz-sidebar', collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        document.getElementById('mobile-nav-toggle')?.focus();
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  async function logout() {
    setBusy(true);
    setError('');
    try { await onLogout(); }
    catch { setError('Could not end the session. Try signing out again.'); }
    finally { setBusy(false); }
  }

  return <div className={'app-shell' + (collapsed ? ' sidebar-collapsed' : '')}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Brand />
        <button type="button" className="mobile-nav-toggle" id="mobile-nav-toggle"
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen}
          aria-controls="dashboard-navigation" onClick={() => setMobileOpen(!mobileOpen)}>
          <Icon name={mobileOpen ? 'close' : 'menu'} />
        </button>
      </div>
      <div className={'sidebar-body' + (mobileOpen ? ' mobile-open' : '')} id="dashboard-navigation">
        <nav className="sidebar-nav" aria-label="Dashboard">
          {links.map(([to, label, icon], index) => <NavLink key={to} to={to} end={index === 0}
            title={label} aria-label={label} onClick={() => {
              if (!mobileOpen) return;
              setMobileOpen(false);
              document.getElementById('main-content')?.focus();
            }}>
            <Icon name={icon} /><span className="sidebar-label">{label}</span>
          </NavLink>)}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar" aria-hidden="true">{user.name.trim().slice(0, 1).toUpperCase()}</span>
            <div className="sidebar-label"><strong>{user.name}</strong><small>{admin ? 'Administrator' : 'Student'}</small></div>
          </div>
          <button type="button" className="sidebar-signout" onClick={logout} disabled={busy} title="Sign out"
            aria-label={busy ? 'Signing out' : 'Sign out'}><Icon name="logout" /><span className="sidebar-label">{busy ? 'Signing out…' : 'Sign out'}</span></button>
          {error && <p className="sidebar-error" role="alert">{error}</p>}
        </div>
      </div>
    </aside>
    <div className="workspace">
      <header className="workspace-bar">
        <button type="button" className="sidebar-toggle" aria-controls="dashboard-navigation"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}>
          <Icon name="panel" />
        </button>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>{pathname === home ? <span aria-current="page">{admin ? 'Admin workspace' : 'Student workspace'}</span>
              : <Link to={home}>{admin ? 'Admin workspace' : 'Student workspace'}</Link>}</li>
            {parent && parent[0] !== home && <li>{pathname === parent[0] ? <span aria-current="page">{parent[1]}</span>
              : <Link to={parent[0]}>{parent[1]}</Link>}</li>}
            {parent && pathname !== parent[0] && <li><span aria-current="page">{detail}</span></li>}
          </ol>
        </nav>
      </header>
      <main id="main-content" className="workspace-main" tabIndex={-1}><Outlet /></main>
    </div>
  </div>;
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
        <Route index element={<AdminSummary api={api} />} />
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

createRoot(document.getElementById('root')).render(<BrowserRouter><ToastProvider><App /></ToastProvider></BrowserRouter>);
