import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, EmptyState } from './ui.jsx';

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dateLabel = (value) => shortDate.format(new Date(value + 'T00:00:00Z'));

function Trend({ title, points, metric, empty }) {
  return (
    <section className="card min-w-0 space-y-3" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {points.some((point) => point[metric] > 0) ? (
        <ResponsiveContainer width="100%" height={230} minWidth={0}>
          <LineChart data={points} margin={{ left: 0, right: 16 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={dateLabel} tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={36} tick={{ fontSize: 11 }} />
            <Tooltip wrapperClassName="chart-tooltip" labelFormatter={dateLabel} />
            <Line dataKey={metric} name={metric === 'attempts' ? 'Attempts' : 'Registrations'} type="linear" stroke={metric === 'attempts' ? '#2563eb' : '#0d9488'}
              strokeWidth={2} dot={points.length < 32} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : <EmptyState icon="chart">{empty}</EmptyState>}
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
        {!passFail.completedAttempts ? <EmptyState icon="chart">No completed attempts in this date range.</EmptyState> : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600" aria-label="Pass and fail breakdown">
              <span>{passFail.completedAttempts} completed</span>
              <Badge tone="green">{passFail.passPercentage}% passed</Badge>
              <Badge tone="red">{passFail.failPercentage}% failed</Badge>
            </div>
            <ResponsiveContainer width="100%" height={190} minWidth={0}>
              <BarChart data={outcomes} margin={{ left: 0, right: 12 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} width={36} />
                <Tooltip wrapperClassName="chart-tooltip" />
                <Bar dataKey="count" name="Attempts" maxBarSize={72} radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  <Cell fill="#16a34a" /><Cell fill="#dc2626" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </section>
    </>
  );
}
