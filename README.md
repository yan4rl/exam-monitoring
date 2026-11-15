# Web-Based Student Examination Behavior Monitoring System Integrated with Google Forms

A monitoring layer for existing Google Forms examinations. Google Forms keeps handling questions,
answers, submission and grading. This system only records browser behavior events during an
authorized examination session and shows them to the instructor for review.

**Status:** all source files are written. Syntax checks passed, but the system has NOT been built,
deployed or tested end to end. Use `docs/TEST_PLAN.md` to test it and record real results.

## Components

| Folder | Contents |
|---|---|
| `browser-extension/` | Chrome Manifest V3 extension (student side): background worker, content script, popup |
| `instructor-dashboard/` | React + Vite + Tailwind dashboard (instructor side) |
| `supabase/` | `schema.sql` (tables, RLS, functions), Edge Functions `join-session` and `log-events` |
| `docs/` | Test plan and student privacy notice |

## How it works

1. The instructor creates a session in the dashboard (Google Forms link, start time, duration). The
   server generates a session code, stores only its hash, and shows the code once.
2. The instructor assigns registered students to the session.
3. The student signs in through the extension popup, selects an assigned session, accepts the
   monitoring notice, and enters the code. The `join-session` Edge Function checks the assignment, the
   time window and the code, then the extension opens the form.
4. While monitoring is active, the extension records events and sends them in batches to `log-events`,
   which validates them before inserting. Events are queued and retried if the connection drops.
5. The instructor reviews events, adds notes, and sets each to Normal Activity, Needs Review or Reviewed.
   Configurable count thresholds only mark events for human review. Nothing is penalized automatically.

## What is monitored (and what is not)

Recorded: tab switches, new tabs opened (no URL or title), window focus changes, page hidden/visible,
copy and paste events (no content), fullscreen exit (only if fullscreen was used), inactivity duration,
connection loss and restore, with timestamps.

Never recorded: form questions or answers, clipboard contents, keystrokes, passwords, other websites,
or other applications and devices. Monitoring runs only on the registered form tab during an active session.

## Setup

### 1. Supabase

1. Create a project at supabase.com.
2. SQL Editor: run `supabase/schema.sql`.
3. Allow instructor accounts **before** they register:
   `insert into public.instructor_allowlist (email) values ('you@school.edu');`
4. Authentication > Providers > Email: for local testing you may turn off "Confirm email".
5. Deploy the Edge Functions (Supabase CLI):
   ```
   cd exam-monitoring
   npx supabase login
   npx supabase init            # once; decline the editor prompts
   npx supabase link --project-ref YOUR-PROJECT-REF
   npx supabase functions deploy join-session
   npx supabase functions deploy log-events
   ```
   JWT verification stays on (the default). The service role key is provided to the functions by Supabase.
6. Retention (optional but recommended): enable the pg_cron extension, then run the commented
   `cron.schedule(...)` line at the end of `schema.sql`. The default is 180 days; change it to match your
   school's policy.

Find your Project URL and anon key under Project Settings > API.

### 2. Instructor dashboard (local)

```
cd instructor-dashboard
cp .env.example .env     # fill in the two values
npm install
npm run dev
```

### 3. Browser extension (local)

1. Edit `browser-extension/config.js` with your Project URL and anon key.
2. Open `chrome://extensions`, enable Developer mode, choose Load unpacked, select `browser-extension/`.
3. Pin the extension and open its popup to sign in.

### 4. GitHub

```
cd exam-monitoring
git init
git add .
git status        # confirm no .env file is listed
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
git push -u origin main
```

### 5. Vercel (dashboard)

1. Import the GitHub repository in Vercel.
2. Set **Root Directory** to `instructor-dashboard` (framework: Vite).
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Then in Supabase, Authentication > URL Configuration, set the Site URL to your Vercel URL.
   `vercel.json` already routes all paths to the single-page app.

## Using the system

- **Instructor:** create an account (allowlisted email), sign in, create a session, copy the code, assign
  students, share the code, watch the dashboard, then review events and end the session.
- **Student:** create an account on the dashboard sign-in page (use your student number), then sign in
  through the extension, accept the notice, enter the code, and take the exam. Submit the Google Form
  first, then press End monitoring.

## Security notes

- Row Level Security on every table; students cannot write logs; only Edge Functions insert events.
- The session code hash column is not readable from the browser. Verification happens server-side.
- Only the anon key appears in client code. The service role key stays in Supabase.
- Event types, timestamps and detail fields are validated server-side.

## Known limitations

- Session code attempts are not rate limited.
- A determined student can disable or uninstall the extension, use another device, or use a second
  browser profile. The system records behavior in a monitored tab; it cannot prevent or detect everything.
- Only full `docs.google.com/forms/...` links are supported (not `forms.gle` short links).
- Google Forms is not placed in fullscreen by this system; fullscreen exit is recorded only if the student
  actually entered fullscreen.
- Instructors can list all registered students when assigning them to a session.
- The dashboard loads the latest 5,000 events; very large deployments need server-side paging.
- Placeholder extension icons are plain generated images.
