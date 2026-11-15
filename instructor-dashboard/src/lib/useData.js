import { useCallback, useEffect, useState } from 'react';
import { supabase, SESSION_COLS } from './supabase';

// Loads everything the signed-in instructor may see (Row Level Security does the filtering).
// The most recent 5000 events are loaded, which is plenty for an undergraduate-scale deployment.
export function useMonitoringData(pollMs = 0) {
  const [state, setState] = useState({
    loading: true, error: null, sessions: [], assignments: [], logs: [], reviews: [], users: []
  });

  const load = useCallback(async () => {
    const q = await Promise.all([
      supabase.from('monitoring_sessions').select(SESSION_COLS).order('start_time', { ascending: false }),
      supabase.from('session_students').select('id,session_id,student_id,monitoring_status,joined_at,ended_at'),
      supabase.from('activity_logs').select('id,session_id,student_id,event_type,event_timestamp,event_details')
        .order('event_timestamp', { ascending: false }).limit(5000),
      supabase.from('monitoring_reviews').select('*'),
      supabase.from('users').select('id,full_name,student_number,email,role')
    ]);
    const failed = q.find((r) => r.error);
    if (failed) return setState((s) => ({ ...s, loading: false, error: failed.error.message }));
    const [sessions, assignments, logs, reviews, users] = q.map((r) => r.data);
    setState({ loading: false, error: null, sessions, assignments, logs, reviews, users });
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!pollMs) return undefined;
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  return { ...state, reload: load };
}
