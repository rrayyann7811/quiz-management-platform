import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const paths = {
  book: 'M4 19V5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1 0-4h14M8 7h8m-8 4h6',
  dashboard: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
  students: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-8a4 4 0 0 1 0 8',
  category: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  chart: 'M3 3v18h18M8 16v-3m5 3V8m5 8V5',
  trophy: 'M8 21h8m-4-4v4M7 4h10v8a5 5 0 0 1-10 0ZM7 6H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4',
  clock: 'M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  logout: 'M10 17l5-5-5-5m5 5H3m10-9h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5',
  panel: 'M3 5h18v14H3zm6 0v14',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M18 6 6 18',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 6',
  question: 'M4 4h16v16H4zm5 5a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01',
  search: 'm21 21-4.5-4.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
};

export function Icon({ name, size = 19 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function PageHeading({ title, description, action }) {
  return <header className="page-heading">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}
  </header>;
}

export function QuickActions({ items }) {
  return <nav className="quick-actions" aria-label="Quick actions">
    {items.map(([label, to, icon]) => <Link className="quick-action" key={to} to={to}>
      <span className="icon-tile"><Icon name={icon} /></span>{label}<Icon name="arrow" size={16} />
    </Link>)}
  </nav>;
}

export function EmptyState({ children, icon = 'book', action }) {
  return <div className="empty-state">
    <span className="icon-tile"><Icon name={icon} /></span>
    <p>{children}</p>{action}
  </div>;
}

export function LoadingState({ error, label = 'Loading…' }) {
  if (error) return <p className="inline-alert" role="alert">{error}</p>;
  return <div className="loading-state" role="status">{label}<div aria-hidden="true" /><div aria-hidden="true" /></div>;
}

const tones = {
  published: 'green', active: 'green', passed: 'green', correct: 'green',
  draft: 'amber', unanswered: 'amber', failed: 'red', incorrect: 'red',
  beginner: 'teal', intermediate: 'blue', advanced: 'amber',
};

export function Badge({ children, tone }) {
  return <span className={'badge badge-' + (tone ?? tones[String(children).toLowerCase()] ?? 'slate')}>{children}</span>;
}

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [notice, setNotice] = useState(null);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);

  function notify(text, error = false) {
    clearTimeout(timer.current);
    setNotice({ text, error });
    if (!error) timer.current = setTimeout(() => setNotice(null), 4500);
  }

  return <ToastContext.Provider value={notify}>
    {children}
    {notice && <div className={'toast' + (notice.error ? ' toast-error' : '')} role={notice.error ? 'alert' : 'status'}>
      <Icon name={notice.error ? 'question' : 'check'} /><span>{notice.text}</span>
      <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification"><Icon name="close" size={16} /></button>
    </div>}
  </ToastContext.Provider>;
}

export const useToast = () => useContext(ToastContext);
