import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useMonitoringData } from '../lib/useData';
import { fmt } from '../lib/rules';

const FORMS_URL = /^https:\/\/docs\.google\.com\/forms\/d\/(e\/)?[A-Za-z0-9_-]+/;

export default function Sessions() {
  const { sessions, assignments, loading, error, reload } = useMonitoringData();
  const [f, setF] = useState({ title: '', url: '', start: '', duration: 60 });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const start = new Date(f.start);
    const dur = Number(f.duration);
    if (f.title.trim().length < 3) return setErr('Enter an examination title of at least 3 characters.');
    if (!FORMS_URL.test(f.url.trim())) return setErr('Enter the full Google Forms link (it starts with https://docs.google.com/forms/).');
    if (Number.isNaN(start.getTime())) return setErr('Choose a start date and time.');
    if (!Number.isInteger(dur) || dur < 1 || dur > 600) return setErr('Duration must be between 1 and 600 minutes.');
    setBusy(true);
    const { data, error: e2 } = await supabase.rpc('create_monitoring_session', {
      p_title: f.title.trim(), p_url: f.url.trim(), p_start: start.toISOString(),
      p_end: new Date(start.getTime() + dur * 60000).toISOString(), p_duration: dur
    });
    setBusy(false);
    if (e2) return setErr(e2.message);
    setCreated({ title: f.title.trim(), code: data[0].session_code, id: data[0].session_id });
    setF({ title: '', url: '', start: '', duration: 60 });
    reload();
  };

  return (
    <>
      <h1>Monitoring Sessions</h1>
      {created && (
        <div className="alert">
          <p>Session created: <strong>{created.title}</strong></p>
          <p>Session code: <strong className="text-lg tracking-widest">{created.code}</strong></p>
          <p className="text-xs">Copy this code now. It is stored only as a hash and cannot be shown again. Share it with assigned students, then <Link to={`/sessions/${created.id}`}>assign students</Link>.</p>
        </div>
      )}
      <form onSubmit={submit} className="panel grid gap-3 md:grid-cols-2">
        <h2 className="md:col-span-2">Create a monitoring session</h2>
        <div><label htmlFor="t">Examination title</label><input id="t" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label htmlFor="u">Google Forms examination link</label><input id="u" className="input" placeholder="https://docs.google.com/forms/d/e/.../viewform" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></div>
        <div><label htmlFor="s">Start date and time</label><input id="s" type="datetime-local" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
        <div><label htmlFor="d">Duration (minutes)</label><input id="d" type="number" min="1" max="600" className="input" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /></div>
        {err && <p className="alert md:col-span-2">{err}</p>}
        <div className="md:col-span-2"><button className="btn" disabled={busy}>Create session</button></div>
      </form>

      <div className="panel">
        <h2>All sessions</h2>
        {loading ? <p>Loading...</p> : error ? <p className="alert">{error}</p> : sessions.length === 0 ? <p>No sessions yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">Examination</th><th className="th">Google Forms link</th><th className="th">Session date</th><th className="th">Assigned students</th><th className="th">Status</th><th className="th"></th></tr></thead>
            <tbody>{sessions.map((s) => (
              <tr key={s.id}>
                <td className="td">{s.exam_title}</td>
                <td className="td"><a href={s.google_forms_url} target="_blank" rel="noreferrer">Open form</a></td>
                <td className="td">{fmt(s.start_time)}</td>
                <td className="td">{assignments.filter((a) => a.session_id === s.id).length}</td>
                <td className="td"><span className="badge capitalize">{s.status}</span></td>
                <td className="td"><Link to={`/sessions/${s.id}`}>View details</Link></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
