import { createClient } from "npm:@supabase/supabase-js@2";

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase into Edge Functions.
// The service role key never leaves the server.
export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const GRACE_MS = 15 * 60 * 1000;

export async function getUser(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

// Loads the student's assignment and session, or null if the student is not authorized.
export async function loadAssignment(sessionId: string, studentId: string) {
  const { data } = await admin
    .from("session_students")
    .select("id, monitoring_status, monitoring_sessions(exam_title, google_forms_url, start_time, end_time, status, rule_config)")
    .eq("session_id", sessionId)
    .eq("student_id", studentId)
    .maybeSingle();
  return data as any;
}

export function inWindow(s: { start_time: string; end_time: string }, now = Date.now()) {
  return now >= Date.parse(s.start_time) - GRACE_MS && now <= Date.parse(s.end_time) + GRACE_MS;
}
