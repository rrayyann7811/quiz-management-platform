import { EmptyState, Icon } from './ui.jsx';

export const formatPercent = (value) => value == null ? '—' : value + '%';

const metrics = {
  totalStudents: 'Total students', activeStudents: 'Active students', inactiveStudents: 'Inactive students',
  archivedStudents: 'Archived students', totalQuizzes: 'Total quizzes', publishedQuizzes: 'Published quizzes',
  draftQuizzes: 'Draft quizzes', unpublishedQuizzes: 'Unpublished quizzes', totalQuestions: 'Total questions',
  totalAttempts: 'Total quiz attempts', completedAttempts: 'Completed attempts', averageScore: 'Average quiz score',
  passedAttempts: 'Passed attempts', failedAttempts: 'Failed attempts',
};

const groups = [
  ['Students', 'students', ['totalStudents', 'activeStudents', 'inactiveStudents', 'archivedStudents']],
  ['Quiz management', 'book', ['totalQuizzes', 'publishedQuizzes', 'draftQuizzes', 'unpublishedQuizzes', 'totalQuestions']],
  ['Performance', 'chart', ['totalAttempts', 'completedAttempts', 'averageScore', 'passedAttempts', 'failedAttempts']],
];

export function MetricGrid({ entries }) {
  return <dl className="metric-grid">
    {entries.map(([label, value]) => <div className="metric-card" key={label}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>)}
  </dl>;
}

export function PlatformStats({ stats }) {
  return <div className="grid gap-5">
    {groups.map(([title, icon, keys]) => <section key={title} className="metric-group" aria-label={title}>
      <h2><span className="icon-tile"><Icon name={icon} /></span>{title}</h2>
      <MetricGrid entries={keys.map((key) => [metrics[key], key === 'averageScore' ? formatPercent(stats[key]) : stats[key]])} />
    </section>)}
  </div>;
}

export function ReportTable({ columns, rows, empty }) {
  if (!rows.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Report table">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100"><tr>{columns.map(([heading]) =>
          <th scope="col" className="whitespace-nowrap p-3" key={heading}>{heading}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-200">{rows.map((row, index) => (
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
