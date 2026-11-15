import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useMonitoringData } from '../lib/useData';
import { enrich, fmt, isRecorded, LABELS, RULE_TYPES, STATUS_LABELS, summaryStatus } from '../lib/rules';

export default function SessionDetail() {
  const { id } = useParams();
  const { sessions, assignments, logs, reviews, users, loading, error, reload } = useMonitoringData(15000);
  const [rules, setRules] = useState(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [msg, setMsg] = useState('');

  const session = sessions.find((s) => s.id === id);
  useEffect(() => { if (session && !rules) setRules({ ...session.rule_config }); }, [session, rules]);

  const events = useMemo(() => enrich(logs, reviews, sessions).filter((e) => e.session_id === id), [logs, reviews, sessions, id]);
  if (loading) return <p>Loading...</p>;
  if (error) return <p className="alert">{error}</p>;
  if (!session) return <p>Session not found. <Link to="/sessions">Back to sessions</Link></p>;

  const userById = new Map(users.map((u) => [u.id, u]));
  const mine = assignments.filter((a) => a.session_id === id);
  const assignedIds = new Set(mine.map((a) => a.student_id));
  const q = search.trim().toLowerCase();
  const available = users.filter((u) => u.role === 'student' && !assignedIds.has(u.id) &&
    (!q || u.full_name.toLowerCase().includes(q) || (u.student_number || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));

  const run = async (promise, ok) => {
    const { error: e } = await promise;
    setMsg(e ? e.message : ok);
    if (!e) reload();
  };
  const setStatus = (status) => run(supabase.from('monitoring_sessions').update({ status }).eq('id', id), `Session status set to ${status}.`);
  const assign = async () => {
    await run(supabase.from('session_students').insert([...picked].map((student_id) => ({ session_id: id, student_id }))), 'Students assigned.');
    setPicked(new Set());
  };
  const unassign = (rowId) => run(supabase.from('session_students').delete().eq('id', rowId), 'Student removed.');
  const saveRules = () => {
    const clean = {};
    for (const [k, v] of Object.entries(rules)) clean[k] = Math.max(0, Math.min(10000, parseInt(v, 10) || 0));
    return run(supabase.from('monitoring_sessions').update({ rule_config: clean }).eq('id', id), 'Review rules saved.');
  };

  return (
    <>
      <p className="mb-2"><Link to="/sessions">Back to sessions</Link></p>
      <h1>{session.exam_title}</h1>
      {msg && <p className="alert">{msg}</p>}

      <div className="panel grid gap-2 md:grid-cols-2">
        <p><strong>Google Forms link:</strong> <a href={session.google_forms_url} target="_blank" rel="noreferrer">Open form</a></p>
        <p><strong>Status:</strong> <span className="badge capitalize">{session.status}</span></p>
        <p><strong>Start:</strong> {fmt(session.start_time)}</p>
        <p><strong>End:</strong> {fmt(session.end_time)} ({session.duration_minutes} minutes)</p>
        <div className="md:col-span-2 flex flex-wrap gap-2">
          {session.status !== 'active' && session.status !== 'completed' && <button className="btn-alt" onClick={() => setStatus('active')}>Mark active</button>}
          {session.status !== 'completed' && <button className="btn" onClick={() => window.confirm('End this monitoring session? Students will no longer be able to join.') && setStatus('completed')}>End session</button>}
          {session.status !== 'inactive' && session.status !== 'completed' && <button className="btn-alt" onClick={() => setStatus('inactive')}>Set inactive</button>}
        </div>
      </div>

      <div className="panel">
        <h2>Participating students</h2>
        {mine.length === 0 ? <p>No students assigned yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">Student</th><th className="th">Student number</th><th className="th">Examination</th><th className="th">Monitoring status</th><th className="th">Recorded activities</th><th className="th">Review status</th><th className="th"></th></tr></thead>
            <tbody>{mine.map((a) => {
              const u = userById.get(a.student_id);
              const ev = events.filter((e) => e.student_id === a.student_id);
              return (
                <tr key={a.id}>
                  <td className="td">{u?.full_name}</td><td className="td">{u?.student_number || '-'}</td>
                  <td className="td">{session.exam_title}</td>
                  <td className="td"><span className="badge capitalize">{a.monitoring_status}</span></td>
                  <td className="td">{ev.filter((e) => isRecorded(e.event_type)).length}</td>
                  <td className="td"><span className="badge">{STATUS_LABELS[summaryStatus(ev)]}</span></td>
                  <td className="td whitespace-nowrap"><Link to={`/sessions/${id}/students/${a.student_id}`}>View record</Link>
                    {a.monitoring_status === 'assigned' && <button className="ml-3 underline text-peri" onClick={() => unassign(a.id)}>Remove</button>}</td>
                </tr>);
            })}</tbody>
          </table></div>
        )}
      </div>

      <div className="panel">
        <h2>Assign students</h2>
        <input className="input mb-3 md:w-1/2" placeholder="Search by name, student number, or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        {available.length === 0 ? <p>No unassigned registered students found. Students must register with the extension's sign-in (Supabase account) first.</p> : (
          <div className="max-h-56 overflow-y-auto border border-lav rounded mb-3">
            {available.map((u) => (
              <label key={u.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-lav/60 mb-0 text-sm font-normal">
                <input type="checkbox" checked={picked.has(u.id)} onChange={() => { const n = new Set(picked); n.has(u.id) ? n.delete(u.id) : n.add(u.id); setPicked(n); }} />
                {u.full_name} <span className="text-xs">{u.student_number || ''} {u.email}</span>
              </label>))}
          </div>)}
        <button className="btn" disabled={picked.size === 0} onClick={assign}>Assign selected ({picked.size})</button>
      </div>

      <div className="panel">
        <h2>Review rules</h2>
        <p className="text-xs mb-3">An activity type is marked Needs Review when its count for a student reaches the threshold. Set 0 to turn a rule off. The inactivity threshold (seconds) is applied when a student joins.</p>
        {rules && (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-3">
            {RULE_TYPES.map((t) => (<div key={t}><label htmlFor={t}>{LABELS[t]}</label><input id={t} type="number" min="0" className="input" value={rules[t] ?? 0} onChange={(e) => setRules({ ...rules, [t]: e.target.value })} /></div>))}
            <div><label htmlFor="idle">Inactivity threshold (s)</label><input id="idle" type="number" min="30" className="input" value={rules.idle_threshold_seconds ?? 120} onChange={(e) => setRules({ ...rules, idle_threshold_seconds: e.target.value })} /></div>
          </div>)}
        <button className="btn" onClick={saveRules}>Save rules</button>
      </div>
    </>
  );
}
