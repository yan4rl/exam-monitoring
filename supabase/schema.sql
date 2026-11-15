-- Google Forms Examination Behavior Monitoring System
-- Run in the Supabase SQL Editor (or as a migration). Safe to run once on a fresh project.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Types ----------
create type public.user_role as enum ('instructor', 'student');
create type public.session_status as enum ('scheduled', 'active', 'completed', 'inactive');
create type public.monitoring_status as enum ('assigned', 'monitoring', 'ended', 'disconnected');
create type public.review_status as enum ('normal', 'needs_review', 'reviewed');

-- ---------- Tables ----------
-- Instructor self-registration is gated by this allowlist (extra table beyond the five required).
create table public.instructor_allowlist (
  email text primary key
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  student_number text unique,
  email text not null unique,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now()
);

create table public.monitoring_sessions (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.users (id) on delete cascade,
  exam_title text not null check (char_length(exam_title) between 3 and 200),
  google_forms_url text not null
    check (google_forms_url ~ '^https://docs\.google\.com/forms/d/(e/)?[A-Za-z0-9_-]+'),
  session_code_hash text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration_minutes int not null check (duration_minutes between 1 and 600),
  status public.session_status not null default 'scheduled',
  -- Configurable review rules: a count of events that flags a student for review.
  rule_config jsonb not null default
    '{"tab_switched_away":3,"fullscreen_exit":2,"copy":3,"paste":3,"inactivity":2,"idle_threshold_seconds":120}',
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table public.session_students (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.monitoring_sessions (id) on delete cascade,
  student_id uuid not null references public.users (id) on delete cascade,
  monitoring_status public.monitoring_status not null default 'assigned',
  joined_at timestamptz,
  ended_at timestamptz,
  unique (session_id, student_id)
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.monitoring_sessions (id) on delete cascade,
  student_id uuid not null references public.users (id) on delete cascade,
  event_type text not null check (event_type in (
    'monitoring_started','monitoring_ended',
    'tab_switched_away','tab_returned','new_tab_opened',
    'page_hidden','page_visible','window_blur','window_focus',
    'copy','paste','fullscreen_exit',
    'inactivity','connection_lost','connection_restored')),
  event_timestamp timestamptz not null,
  -- Only small metadata such as duration_seconds. Never clipboard text, keystrokes or URLs.
  event_details jsonb not null default '{}' check (pg_column_size(event_details) < 1024),
  created_at timestamptz not null default now()
);

create table public.monitoring_reviews (
  id uuid primary key default gen_random_uuid(),
  activity_log_id uuid not null unique references public.activity_logs (id) on delete cascade,
  instructor_id uuid not null references public.users (id) on delete cascade,
  review_status public.review_status not null default 'needs_review',
  instructor_notes text check (char_length(instructor_notes) <= 2000),
  reviewed_at timestamptz
);

-- ---------- Indexes ----------
create index idx_sessions_instructor on public.monitoring_sessions (instructor_id, start_time desc);
create index idx_ss_session on public.session_students (session_id);
create index idx_ss_student on public.session_students (student_id);
create index idx_logs_session_student on public.activity_logs (session_id, student_id, event_timestamp);
create index idx_logs_type on public.activity_logs (session_id, event_type);
create index idx_reviews_instructor on public.monitoring_reviews (instructor_id);

-- ---------- New user -> profile ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, full_name, student_number, email, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'student_number', ''),
    new.email,
    case when exists (select 1 from public.instructor_allowlist a where lower(a.email) = lower(new.email))
         then 'instructor'::public.user_role else 'student'::public.user_role end);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Helper functions (used by RLS) ----------
create function public.is_instructor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'instructor');
$$;

create function public.owns_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.monitoring_sessions where id = p_session and instructor_id = auth.uid());
$$;

create function public.is_assigned(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.session_students where session_id = p_session and student_id = auth.uid());
$$;

-- ---------- Session creation: code is generated server-side, hashed, shown once ----------
create function public.create_monitoring_session(
  p_title text, p_url text, p_start timestamptz, p_end timestamptz, p_duration int)
returns table (session_id uuid, session_code text)
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text; v_id uuid;
begin
  if not public.is_instructor() then raise exception 'Instructors only'; end if;
  v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  insert into public.monitoring_sessions
    (instructor_id, exam_title, google_forms_url, session_code_hash, start_time, end_time, duration_minutes)
  values (auth.uid(), p_title, p_url, crypt(v_code, gen_salt('bf')), p_start, p_end, p_duration)
  returning id into v_id;
  return query select v_id, v_code;
end $$;

-- Only Edge Functions (service role) may verify codes.
create function public.verify_session_code(p_session uuid, p_code text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.monitoring_sessions
                 where id = p_session and session_code_hash = crypt(upper(p_code), session_code_hash));
$$;

-- ---------- Privileges ----------
revoke all on all tables in schema public from anon, authenticated;
revoke execute on function public.create_monitoring_session(text, text, timestamptz, timestamptz, int) from public, anon;
revoke execute on function public.verify_session_code(uuid, text) from public, anon, authenticated;
grant execute on function public.create_monitoring_session(text, text, timestamptz, timestamptz, int) to authenticated;
grant execute on function public.verify_session_code(uuid, text) to service_role;

grant select on public.users to authenticated;
-- The code hash column is deliberately NOT selectable from the client.
grant select (id, instructor_id, exam_title, google_forms_url, start_time, end_time,
              duration_minutes, status, rule_config, created_at)
  on public.monitoring_sessions to authenticated;
grant update (exam_title, google_forms_url, start_time, end_time, duration_minutes, status, rule_config)
  on public.monitoring_sessions to authenticated;
grant delete on public.monitoring_sessions to authenticated;
grant select, insert, delete on public.session_students to authenticated;
grant select on public.activity_logs to authenticated;  -- inserts only via Edge Function
grant select, insert, update on public.monitoring_reviews to authenticated;

-- ---------- Row Level Security ----------
alter table public.instructor_allowlist enable row level security;  -- no policies: invisible to clients
alter table public.users enable row level security;
alter table public.monitoring_sessions enable row level security;
alter table public.session_students enable row level security;
alter table public.activity_logs enable row level security;
alter table public.monitoring_reviews enable row level security;

create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or public.is_instructor());

create policy sessions_instructor on public.monitoring_sessions for all to authenticated
  using (instructor_id = auth.uid()) with check (instructor_id = auth.uid());
create policy sessions_student_select on public.monitoring_sessions for select to authenticated
  using (public.is_assigned(id));

create policy ss_instructor on public.session_students for all to authenticated
  using (public.owns_session(session_id)) with check (public.owns_session(session_id));
create policy ss_student_select on public.session_students for select to authenticated
  using (student_id = auth.uid());

create policy logs_instructor_select on public.activity_logs for select to authenticated
  using (public.owns_session(session_id));
create policy logs_student_select on public.activity_logs for select to authenticated
  using (student_id = auth.uid());

create policy reviews_instructor on public.monitoring_reviews for all to authenticated
  using (instructor_id = auth.uid()
         and exists (select 1 from public.activity_logs l
                     where l.id = activity_log_id and public.owns_session(l.session_id)))
  with check (instructor_id = auth.uid()
         and exists (select 1 from public.activity_logs l
                     where l.id = activity_log_id and public.owns_session(l.session_id)));

-- ---------- Per-student summary for the dashboard (respects RLS) ----------
create view public.student_monitoring_summary with (security_invoker = true) as
select ss.session_id, ss.student_id, u.full_name, u.student_number,
       s.exam_title, ss.monitoring_status,
       count(l.id) filter (where l.event_type not in ('monitoring_started','monitoring_ended',
         'tab_returned','page_visible','window_focus','connection_restored')) as flagged_event_count
from public.session_students ss
join public.users u on u.id = ss.student_id
join public.monitoring_sessions s on s.id = ss.session_id
left join public.activity_logs l on l.session_id = ss.session_id and l.student_id = ss.student_id
group by ss.session_id, ss.student_id, u.full_name, u.student_number, s.exam_title, ss.monitoring_status;
grant select on public.student_monitoring_summary to authenticated;

-- ---------- Retention policy: delete logs older than N days (default 180) ----------
create function public.purge_old_activity_logs(p_days int default 180) returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  delete from public.activity_logs where created_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_old_activity_logs(int) from public, anon, authenticated;
-- Schedule with pg_cron if enabled:
-- select cron.schedule('purge-activity-logs', '0 3 * * *', $$select public.purge_old_activity_logs(180)$$);
