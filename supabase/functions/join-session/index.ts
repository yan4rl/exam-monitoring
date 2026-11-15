import { admin, cors, getUser, inWindow, json, loadAssignment, UUID } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = await getUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const { session_id, code } = body ?? {};
  if (typeof session_id !== "string" || !UUID.test(session_id) ||
      typeof code !== "string" || !/^[A-Za-z0-9]{8}$/.test(code)) {
    return json({ error: "Invalid session or code" }, 400);
  }

  // Same generic message for every failure so session details are not revealed.
  const denied = () => json({ error: "You are not authorized to join this session." }, 403);

  const a = await loadAssignment(session_id, user.id);
  if (!a) return denied();
  const s = a.monitoring_sessions;
  if (s.status === "completed" || s.status === "inactive" || !inWindow(s)) return denied();

  const { data: ok, error } = await admin.rpc("verify_session_code", { p_session: session_id, p_code: code });
  if (error || ok !== true) return json({ error: "Incorrect session code." }, 403);

  if (s.status === "scheduled") {
    await admin.from("monitoring_sessions").update({ status: "active" }).eq("id", session_id);
  }
  await admin.from("session_students")
    .update({ monitoring_status: "monitoring", joined_at: new Date().toISOString(), ended_at: null })
    .eq("id", a.id);
  await admin.from("activity_logs").insert({
    session_id, student_id: user.id, event_type: "monitoring_started",
    event_timestamp: new Date().toISOString(), event_details: {},
  });

  return json({
    exam_title: s.exam_title,
    google_forms_url: s.google_forms_url,
    end_time: s.end_time,
    idle_threshold_seconds: Number(s.rule_config?.idle_threshold_seconds) || 120,
  });
});
