import { Bar, BarChart, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dateLabel = (value) => shortDate.format(new Date(value + 'T00:00:00Z'));

function Trend({ title, points, metric, empty }) {
  return (
    <section className="card min-w-0 space-y-3" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {points.some((point) => point[metric] > 0) ? (
        <ResponsiveContainer width="100%" height={230} minWidth={0}>
          <LineChart data={points} margin={{ left: 0, right: 16 }} accessibilityLayer>
            <XAxis dataKey="date" tickFormatter={dateLabel} tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis allowDecimals={false} width={36} tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={dateLabel} />
            <Line dataKey={metric} name={metric === 'attempts' ? 'Attempts' : 'Registrations'} type="linear" stroke="#1d4ed8"
              strokeWidth={2} dot={points.length < 32} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : <p className="text-sm text-slate-600">{empty}</p>}
    </section>
  );
}

export default function AnalyticsCharts({ data }) {
  const { passFail } = data;
  const outcomes = [{ name: 'Passed', count: passFail.passedAttempts }, { name: 'Failed', count: passFail.failedAttempts }];
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        <Trend title="Quiz attempts over time" points={data.attemptTrends} metric="attempts" empty="No quiz starts in this date range." />
        <Trend title="Student registrations" points={data.studentRegistrations} metric="registrations" empty="No student registrations in this date range." />
      </div>
      <section className="card min-w-0 max-w-2xl space-y-3" aria-labelledby="pass-fail-title">
        <h2 id="pass-fail-title" className="text-lg font-semibold">Pass/fail distribution</h2>
        {!passFail.completedAttempts ? <p className="text-sm text-slate-600">No completed attempts in this date range.</p> : (
          <>
            <p className="text-sm text-slate-600">{passFail.completedAttempts} completed · {passFail.passPercentage}% passed · {passFail.failPercentage}% failed</p>
            <ResponsiveContainer width="100%" height={190} minWidth={0}>
              <BarChart data={outcomes} margin={{ left: 0, right: 12 }} accessibilityLayer>
                <XAxis dataKey="name" /><YAxis allowDecimals={false} width={36} /><Tooltip />
                <Bar dataKey="count" name="Attempts" isAnimationActive={false}>
                  <Cell fill="#047857" /><Cell fill="#b91c1c" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </section>
    </>
  );
}
