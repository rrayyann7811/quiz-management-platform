export const formatPercent = (value) => value == null ? '—' : value + '%';

const metrics = {
  totalStudents: 'Total students', activeStudents: 'Active students', inactiveStudents: 'Inactive students',
  archivedStudents: 'Archived students', totalQuizzes: 'Total quizzes', publishedQuizzes: 'Published quizzes',
  draftQuizzes: 'Draft quizzes', unpublishedQuizzes: 'Unpublished quizzes', totalQuestions: 'Total questions',
  totalAttempts: 'Total quiz attempts', completedAttempts: 'Completed attempts', averageScore: 'Average quiz score',
  passedAttempts: 'Passed attempts', failedAttempts: 'Failed attempts',
};

export function PlatformStats({ stats }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {Object.entries(metrics).map(([key, label]) => (
        <div className="card p-4 sm:p-5" key={key}>
          <dt className="text-sm text-slate-600">{label}</dt>
          <dd className="mt-2 text-xl font-semibold">{key === 'averageScore' ? formatPercent(stats[key]) : stats[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReportTable({ columns, rows, empty }) {
  if (!rows.length) return <p className="text-sm text-slate-600">{empty}</p>;
  return (
    <div className="relative overflow-x-auto rounded-md border border-slate-200 bg-white">
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
