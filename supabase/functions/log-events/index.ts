import { admin, cors, getUser, GRACE_MS, inWindow, json, loadAssignment, UUID } from "../_shared/common.ts";

const TYPES = new Set([
  "monitoring_ended", "tab_switched_away", "tab_returned", "new_tab_opened",
  "page_hidden", "page_visible", "window_blur", "window_focus",
  "copy", "paste", "fullscreen_exit", "inactivity",
  "connection_lost", "connection_restored",
]);

// Only these two metadata fields are ever stored.
function cleanDetails(d: any) {
  const out: Record<string, unknown> = {};
  if (d && typeof d === "object") {
    if (Number.isFinite(d.duration_seconds)) {
      out.duration_seconds = Math.min(Math.max(0, Math.round(d.duration_seconds)), 86400);
    }
    if (d.reason === "tab_closed") out.reason = "tab_closed";
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = await getUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const { session_id, events } = body ?? {};
  if (typeof session_id !== "string" || !UUID.test(session_id) ||
      !Array.isArray(events) || events.length < 1 || events.length > 50) {
    return json({ error: "Invalid request" }, 400);
  }

  const a = await loadAssignment(session_id, user.id);
  if (!a || a.monitoring_status === "assigned" || a.monitoring_status === "ended") {
    return json({ error: "Not authorized" }, 403);
  }
  const s = a.monitoring_sessions;
  if (!inWindow(s)) return json({ error: "Outside the monitoring window" }, 403);

  const now = Date.now();
  const minTs = Date.parse(s.start_time) - GRACE_MS;
  const rows = events
    .filter((e: any) => e && TYPES.has(e.event_type))
    .map((e: any) => ({ e, t: Date.parse(e.event_timestamp) }))
    .filter(({ t }) => Number.isFinite(t) && t >= minTs && t <= now + 60_000)
    .map(({ e, t }) => ({
      session_id,
      student_id: user.id,
      event_type: e.event_type,
      event_timestamp: new Date(t).toISOString(),
      event_details: cleanDetails(e.details),
    }));
  if (rows.length === 0) return json({ error: "No valid events" }, 400);

  const { error } = await admin.from("activity_logs").insert(rows);
  if (error) return json({ error: "Could not store events" }, 500);

  if (rows.some((r) => r.event_type === "monitoring_ended")) {
    await admin.from("session_students")
      .update({ monitoring_status: "ended", ended_at: new Date().toISOString() })
      .eq("id", a.id);
  }
  return json({ accepted: rows.length });
});
