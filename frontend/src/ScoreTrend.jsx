import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function ScoreTrend({ entries }) {
  const points = entries.map((attempt, i) => ({ ...attempt, sequence: i + 1 }));
  const ticks = points.filter((_, i) => i % Math.ceil(points.length / 5) === 0 || i === points.length - 1)
    .map(({ sequence }) => sequence);
  return (
    <>
      <p className="text-sm text-slate-600">Your latest {points.length} completed {points.length === 1 ? 'attempt' : 'attempts'}.</p>
      <ResponsiveContainer width="100%" height={220} minWidth={0}>
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 8, left: 0 }} accessibilityLayer>
          <XAxis dataKey="sequence" ticks={ticks} tickFormatter={(value) => {
            const point = points[value - 1];
            return point ? new Date(point.finalizedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
          }} tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} width={44} tickFormatter={(value) => value + '%'} tick={{ fontSize: 11 }} />
          <Tooltip
            labelFormatter={(_, payload) => payload[0]?.payload.quizTitle ?? ''}
            formatter={(value) => [value + '%', 'Score']}
          />
          <Line type="linear" dataKey="percentage" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
