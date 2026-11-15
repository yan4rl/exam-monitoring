import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// session_code_hash is not selectable from the client, so never use select('*') on this table.
export const SESSION_COLS =
  'id,instructor_id,exam_title,google_forms_url,start_time,end_time,duration_minutes,status,rule_config,created_at';
