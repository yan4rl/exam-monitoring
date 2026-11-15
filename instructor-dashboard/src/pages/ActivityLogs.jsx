import { useMemo, useState } from 'react';
import { useMonitoringData } from '../lib/useData';
import EventTable from '../components/EventTable.jsx';
import { enrich, LABELS, STATUS_LABELS } from '../lib/rules';

export default function ActivityLogs() {
  const { sessions, logs, reviews, users, loading, error, reload } = useMonitoringData(15000);
  const [f, setF] = useState({ q: '', session: '', type: '', status: '' });
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return enrich(logs, reviews, sessions).filter((e) => {
      const u = userById.get(e.student_id);
      return (!f.session || e.session_id === f.session) && (!f.type || e.event_type === f.type) &&
        (!f.status || e.status === f.status) &&
        (!q || u?.full_name.toLowerCase().includes(q) || (u?.student_number || '').toLowerCase().includes(q));
    });
  }, [logs, reviews, sessions, userById, f]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="alert">{error}</p>;

  return (
    <>
      <h1>Activity Logs</h1>
      <div className="panel grid gap-3 md:grid-cols-4">
        <div><label htmlFor="q">Search student</label><input id="q" className="input" placeholder="Name or student number" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <div><label htmlFor="s">Examination</label><select id="s" className="input" value={f.session} onChange={(e) => setF({ ...f, session: e.target.value })}>
          <option value="">All examinations</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.exam_title}</option>)}</select></div>
        <div><label htmlFor="t">Activity type</label><select id="t" className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="">All activity types</option>{Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label htmlFor="r">Review status</label><select id="r" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <div className="panel"><EventTable rows={rows} userById={userById} sessionById={sessionById} onSaved={reload} /></div>
    </>
  );
}
