import { Link } from 'react-router-dom';
import { useMonitoringData } from '../lib/useData';
import { enrich, fmt, STATUS_LABELS } from '../lib/rules';

export default function Dashboard() {
  const { sessions, assignments, logs, reviews, loading, error } = useMonitoringData(15000);
  if (loading) return <p>Loading...</p>;
  if (error) return <p className="alert">{error}</p>;

  const events = enrich(logs, reviews, sessions);
  const stats = [
    ['Total monitoring sessions', sessions.length],
    ['Active examinations', sessions.filter((s) => s.status === 'active').length],
    ['Students currently monitored', assignments.filter((a) => a.monitoring_status === 'monitoring').length],
    ['Activities requiring review', events.filter((e) => e.status === 'needs_review').length]
  ];
  const recent = sessions.slice(0, 5);

  return (
    <>
      <h1>Dashboard</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {stats.map(([label, n]) => (
          <div key={label} className="border border-lav bg-white rounded p-4">
            <p className="text-2xl font-semibold">{n}</p><p className="text-xs">{label}</p>
          </div>
        ))}
      </div>
      <div className="panel">
        <h2>Recent monitoring sessions</h2>
        {recent.length === 0 ? <p>No sessions yet. <Link to="/sessions">Create one</Link>.</p> : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">Examination</th><th className="th">Date</th><th className="th">Students</th><th className="th">Status</th><th className="th"></th></tr></thead>
            <tbody>{recent.map((s) => (
              <tr key={s.id}>
                <td className="td">{s.exam_title}</td><td className="td">{fmt(s.start_time)}</td>
                <td className="td">{assignments.filter((a) => a.session_id === s.id).length}</td>
                <td className="td"><span className="badge capitalize">{s.status}</span></td>
                <td className="td"><Link to={`/sessions/${s.id}`}>View details</Link></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      <p className="text-xs">Classifications are review aids only: {Object.values(STATUS_LABELS).join(', ')}. No student is automatically treated as having cheated. This page refreshes every 15 seconds.</p>
    </>
  );
}
