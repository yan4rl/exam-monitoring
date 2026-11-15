export const LABELS = {
  monitoring_started: 'Monitoring started', monitoring_ended: 'Monitoring ended',
  tab_switched_away: 'Examination tab changed', tab_returned: 'Returned to examination tab',
  new_tab_opened: 'New tab opened', page_hidden: 'Examination page hidden',
  page_visible: 'Examination page visible', window_blur: 'Window lost focus',
  window_focus: 'Window regained focus', copy: 'Copy activity', paste: 'Paste activity',
  fullscreen_exit: 'Fullscreen exited', inactivity: 'Extended inactivity',
  connection_lost: 'Connection lost', connection_restored: 'Connection restored'
};
export const STATUS_LABELS = { normal: 'Normal Activity', needs_review: 'Needs Review', reviewed: 'Reviewed' };

// Event types a rule can count. tab_switched_away is counted instead of page_hidden/window_blur
// so that one action is not counted several times.
export const RULE_TYPES = ['tab_switched_away', 'fullscreen_exit', 'copy', 'paste', 'inactivity'];

export const isRecorded = (t) => t !== 'monitoring_started' && t !== 'monitoring_ended';
export const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '');

export function countByType(events) {
  const c = {};
  events.forEach((e) => { c[e.event_type] = (c[e.event_type] || 0) + 1; });
  return c;
}

// A type is flagged when its count reaches the configured threshold (0 disables the rule).
export function flaggedTypes(events, config) {
  const c = countByType(events);
  return new Set(RULE_TYPES.filter((t) => Number(config?.[t]) > 0 && (c[t] || 0) >= Number(config[t])));
}

// Adds an effective review status to each log: a saved review wins, otherwise the rule result.
export function enrich(logs, reviews, sessions) {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const reviewByLog = new Map(reviews.map((r) => [r.activity_log_id, r]));
  const groups = new Map();
  logs.forEach((l) => {
    const k = `${l.session_id}|${l.student_id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  });
  const flagged = new Map();
  groups.forEach((evs, k) => flagged.set(k, flaggedTypes(evs, sessionById.get(evs[0].session_id)?.rule_config)));
  return logs.map((l) => {
    const review = reviewByLog.get(l.id) || null;
    const f = flagged.get(`${l.session_id}|${l.student_id}`);
    return { ...l, review, status: review ? review.review_status : f.has(l.event_type) ? 'needs_review' : 'normal' };
  });
}

export function summaryStatus(events) {
  if (events.some((e) => e.status === 'needs_review')) return 'needs_review';
  if (events.some((e) => e.status === 'reviewed')) return 'reviewed';
  return 'normal';
}
