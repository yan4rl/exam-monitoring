import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMonitoringData } from '../lib/useData';
import EventTable from '../components/EventTable.jsx';
import { countByType, enrich, fmt, LABELS, RULE_TYPES, STATUS_LABELS, summaryStatus } from '../lib/rules';

export default function StudentRecord() {
  const { id, studentId } = useParams();
  const { sessions, assignments, logs, reviews, users, loading, error, reload } = useMonitoringData(15000);
  const events = useMemo(
    () => enrich(logs, reviews, sessions).filter((e) => e.session_id === id && e.student_id === studentId),
    [logs, reviews, sessions, id, studentId]
  );
  if (loading) return <p>Loading...</p>;
  if (error) return <p className="alert">{error}</p>;

  const session = sessions.find((s) => s.id === id);
  const student = users.find((u) => u.id === studentId);
  const assignment = assignments.find((a) => a.session_id === id && a.student_id === studentId);
  if (!session || !student) return <p>Record not found. <Link to="/sessions">Back to sessions</Link></p>;
  const counts = countByType(events);

  return (
    <>
      <p className="mb-2"><Link to={`/sessions/${id}`}>Back to session</Link></p>
      <h1>{student.full_name}</h1>
      <div className="panel grid gap-2 md:grid-cols-2">
        <p><strong>Student number:</strong> {student.student_number || '-'}</p>
        <p><strong>Examination:</strong> {session.exam_title}</p>
        <p><strong>Monitoring status:</strong> <span className="badge capitalize">{assignment?.monitoring_status || 'not assigned'}</span></p>
        <p><strong>Joined:</strong> {fmt(assignment?.joined_at) || '-'} <strong className="ml-3">Ended:</strong> {fmt(assignment?.ended_at) || '-'}</p>
        <p><strong>Overall:</strong> <span className="badge">{STATUS_LABELS[summaryStatus(events)]}</span></p>
      </div>

      <div className="panel">
        <h2>Rule summary</h2>
        <p className="text-xs mb-2">These counts come directly from the events listed below. A rule only marks events for human review.</p>
        <div className="overflow-x-auto"><table className="w-full md:w-2/3">
          <thead><tr><th className="th">Activity</th><th className="th">Recorded</th><th className="th">Threshold</th><th className="th">Result</th></tr></thead>
          <tbody>{RULE_TYPES.map((t) => {
            const th = Number(session.rule_config?.[t]) || 0;
            return (<tr key={t}><td className="td">{LABELS[t]}</td><td className="td">{counts[t] || 0}</td><td className="td">{th || 'Off'}</td>
              <td className="td">{th > 0 && (counts[t] || 0) >= th ? 'Needs Review' : 'Within threshold'}</td></tr>);
          })}</tbody>
        </table></div>
      </div>

      <div className="panel">
        <h2>Recorded events</h2>
        <EventTable rows={events} userById={new Map(users.map((u) => [u.id, u]))} sessionById={new Map(sessions.map((s) => [s.id, s]))} onSaved={reload} />
      </div>
    </>
  );
}
