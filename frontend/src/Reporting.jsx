import { EmptyState, Icon } from './ui.jsx';

export const formatPercent = (value) => value == null ? '—' : value + '%';

const metrics = {
  totalStudents: ['Total students', 'students', 'sage'],
  activeStudents: ['Active students', 'check', 'sage'],
  inactiveStudents: ['Inactive students', 'pause', 'gold'],
  archivedStudents: ['Archived students', 'archive', 'plum'],
  totalQuizzes: ['Total quizzes', 'book', 'sage'],
  publishedQuizzes: ['Published quizzes', 'check', 'sage'],
  draftQuizzes: ['Draft quizzes', 'plus', 'gold'],
  unpublishedQuizzes: ['Unpublished quizzes', 'pause', 'plum'],
  totalQuestions: ['Total questions', 'question', 'clay'],
  totalAttempts: ['Total quiz attempts', 'clock', 'sage'],
  completedAttempts: ['Completed attempts', 'check', 'sage'],
  averageScore: ['Average quiz score', 'target', 'plum'],
  passedAttempts: ['Passed attempts', 'check', 'sage'],
  failedAttempts: ['Failed attempts', 'close', 'clay'],
};

const groups = [
  ['Students', 'students', 'sage', ['totalStudents', 'activeStudents', 'inactiveStudents', 'archivedStudents']],
  ['Quiz Management', 'book', 'clay', ['totalQuizzes', 'publishedQuizzes', 'draftQuizzes', 'unpublishedQuizzes', 'totalQuestions']],
  ['Performance', 'chart', 'plum', ['totalAttempts', 'completedAttempts', 'averageScore', 'passedAttempts', 'failedAttempts']],
];

export function MetricGrid({ entries }) {
  return <dl className="metric-grid">
    {entries.map(([label, value, icon, tone]) => <div className="metric-card" key={label}>
      <dt className="metric-label">{label}{icon && <span className={'metric-icon badge-' + tone}><Icon name={icon} size={14} /></span>}</dt>
      <dd>{value}</dd>
    </div>)}
  </dl>;
}

export function PlatformStats({ stats }) {
  return <div className="grid gap-6">
    {groups.map(([title, icon, tone, keys]) => <section key={title} className="metric-group" aria-label={title}>
      <h2><span className={'icon-tile badge-' + tone}><Icon name={icon} /></span>{title}</h2>
      <MetricGrid entries={keys.map((key) => {
        const [label, symbol, accent] = metrics[key];
        return [label, key === 'averageScore' ? formatPercent(stats[key]) : stats[key], symbol, accent];
      })} />
    </section>)}
  </div>;
}

export function ReportTable({ columns, rows, empty }) {
  if (!rows.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Report table">
      <table className="w-full text-left text-sm">
        <thead className="bg-subtle"><tr>{columns.map(([heading]) =>
          <th scope="col" className="whitespace-nowrap p-3" key={heading}>{heading}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((row, index) => (
          <tr key={row.id ?? row.studentId ?? index}>{columns.map(([heading, value], column) => column === 0
            ? <th scope="row" className="p-3 font-medium" key={heading}>{value(row)}</th>
            : <td className="p-3" key={heading}>{value(row)}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function PageControls({ page, hasMore, onChange, name }) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="flex flex-wrap items-center gap-3 text-sm" aria-label={name}>
      <button className="button" disabled={page === 1} onClick={() => onChange(page - 1)}>Previous</button>
      <span>Page {page}</span>
      <button className="button" disabled={!hasMore} onClick={() => onChange(page + 1)}>Next</button>
    </nav>
  );
}
