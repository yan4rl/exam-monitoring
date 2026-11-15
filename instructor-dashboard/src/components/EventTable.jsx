import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth.jsx';
import { fmt, LABELS, STATUS_LABELS } from '../lib/rules';

const MAX_ROWS = 300;

// Activity log table with inline review (status + instructor notes).
export default function EventTable({ rows, userById, sessionById, onSaved }) {
  const { session } = useAuth();
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState({ status: 'reviewed', notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (r) => {
    setErr('');
    setOpenId(r.id);
    setDraft({ status: r.review ? r.review.review_status : 'reviewed', notes: r.review?.instructor_notes || '' });
  };

  const save = async (r) => {
    setBusy(true); setErr('');
    const { error } = await supabase.from('monitoring_reviews').upsert({
      activity_log_id: r.id,
      instructor_id: session.user.id,
      review_status: draft.status,
      instructor_notes: draft.notes.trim() || null,
      reviewed_at: draft.status === 'reviewed' ? new Date().toISOString() : null
    }, { onConflict: 'activity_log_id' });
    setBusy(false);
    if (error) return setErr(error.message);
    setOpenId(null);
    onSaved();
  };

  if (!rows.length) return <p>No activity records match.</p>;
  return (
    <>
      {rows.length > MAX_ROWS && <p className="mb-2">Showing the latest {MAX_ROWS} of {rows.length} records. Use the filters to narrow the list.</p>}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="th">Student</th><th className="th">Activity</th><th className="th">Timestamp</th>
            <th className="th">Examination</th><th className="th">Review status</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {rows.slice(0, MAX_ROWS).map((r) => {
              const u = userById.get(r.student_id);
              const dur = r.event_details?.duration_seconds;
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td className="td">
                      <Link to={`/sessions/${r.session_id}/students/${r.student_id}`}>{u?.full_name || 'Unknown'}</Link>
                    </td>
                    <td className="td">{LABELS[r.event_type] || r.event_type}{dur ? ` (${dur} s)` : ''}</td>
                    <td className="td whitespace-nowrap">{fmt(r.event_timestamp)}</td>
                    <td className="td">{sessionById.get(r.session_id)?.exam_title}</td>
                    <td className="td"><span className="badge">{STATUS_LABELS[r.status]}</span>{r.review?.instructor_notes && <span className="block text-xs mt-1">Note saved</span>}</td>
                    <td className="td"><button className="btn-alt" onClick={() => (openId === r.id ? setOpenId(null) : open(r))}>{openId === r.id ? 'Close' : 'Review'}</button></td>
                  </tr>
                  {openId === r.id && (
                    <tr><td className="td bg-paper" colSpan={6}>
                      <div className="grid gap-3 md:grid-cols-[200px_1fr_auto] items-end">
                        <div>
                          <label>Classification</label>
                          <select className="input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label>Instructor notes</label>
                          <textarea className="input" rows={2} maxLength={2000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                        </div>
                        <button className="btn" disabled={busy} onClick={() => save(r)}>Save review</button>
                      </div>
                      {err && <p className="mt-2">{err}</p>}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
