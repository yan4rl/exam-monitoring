// Background service worker. State lives in chrome.storage.local because the worker can be
// stopped at any time. Only the registered exam tab's URL is ever inspected; URLs and titles of
// other tabs are never read or stored.
importScripts('config.js', 'api.js');

const get = async (k) => (await chrome.storage.local.get(k))[k];
const set = (o) => chrome.storage.local.set(o);

// Serialize storage read-modify-write operations.
let chain = Promise.resolve();
const serial = (fn) => (chain = chain.then(fn, fn));

function formKey(url) {
  try {
    const u = new URL(url);
    if (u.origin !== 'https://docs.google.com') return null;
    const m = u.pathname.match(/^\/forms\/d\/(e\/)?([A-Za-z0-9_-]+)/);
    return m ? (m[1] ? 'e/' : '') + m[2] : null;
  } catch (_) { return null; }
}

const CONTENT_EVENTS = new Set([
  'page_hidden', 'page_visible', 'window_blur', 'window_focus', 'copy', 'paste',
  'fullscreen_exit', 'inactivity', 'connection_lost', 'connection_restored'
]);

const NOTICES = {
  tab_switched_away: 'Examination tab changed.',
  window_blur: 'Examination window lost focus.',
  fullscreen_exit: 'Fullscreen exited.',
  copy: 'Copy activity detected.',
  paste: 'Paste activity detected.',
  inactivity: 'Extended inactivity detected.'
};
const lastNotified = {};
function notify(type) {
  const text = NOTICES[type];
  if (!text || Date.now() - (lastNotified[type] || 0) < 30000) return; // avoid notification spam
  lastNotified[type] = Date.now();
  chrome.notifications.create({
    type: 'basic', iconUrl: 'icons/icon128.png',
    title: 'Exam Behavior Monitor', message: `${text} This was recorded.`
  });
}

function record(event_type, details = {}, ts) {
  return serial(async () => {
    const m = await get('monitor');
    if (!m || !m.active) return;
    const queue = (await get('queue')) || [];
    queue.push({
      session_id: m.session_id, event_type, details,
      event_timestamp: ts || new Date().toISOString()
    });
    const recent = ((await get('recent')) || []).concat({ event_type, at: Date.now() }).slice(-5);
    await set({ queue, recent });
    notify(event_type);
  }).then(flush);
}

function flush() {
  return serial(async () => {
    const queue = (await get('queue')) || [];
    if (!queue.length) return;
    const sessionId = queue[0].session_id;
    const batch = queue.filter((e) => e.session_id === sessionId).slice(0, 50);
    let res;
    try {
      res = await API.callFunction('log-events', {
        session_id: sessionId,
        events: batch.map(({ event_type, event_timestamp, details }) => ({ event_type, event_timestamp, details }))
      });
    } catch (_) { return; } // offline or token problem: keep queued, retry on next alarm
    const permanentReject = res.status >= 400 && res.status < 500 && ![401, 429].includes(res.status);
    if (res.ok || permanentReject) {
      if (!res.ok) console.warn('Event batch rejected', res.status, res.data);
      const rest = queue.filter((e) => !batch.includes(e));
      await set({ queue: rest });
      if (rest.length) queueMicrotask(flush);
    }
  });
}

async function startMonitoring({ session_id, code }) {
  const m = await get('monitor');
  if (m && m.active) return { ok: false, error: 'Monitoring is already active.' };
  let res;
  try { res = await API.callFunction('join-session', { session_id, code }); }
  catch (e) { return { ok: false, error: e.message || 'Network error' }; }
  if (!res.ok) return { ok: false, error: (res.data && res.data.error) || 'Unable to join session.' };
  const d = res.data;
  const tab = await chrome.tabs.create({ url: d.google_forms_url, active: true });
  await set({
    recent: [],
    monitor: {
      active: true, session_id, exam_title: d.exam_title, form_key: formKey(d.google_forms_url),
      tab_id: tab.id, window_id: tab.windowId, away: false,
      idle: d.idle_threshold_seconds, end_time: d.end_time
    }
  });
  chrome.alarms.create('tick', { periodInMinutes: 1 });
  return { ok: true };
}

async function endMonitoring() {
  const m = await get('monitor');
  if (!m || !m.active) return;
  await record('monitoring_ended');
  await set({ monitor: { ...m, active: false } });
  chrome.alarms.clear('tick');
  if (m.tab_id != null) chrome.tabs.sendMessage(m.tab_id, { type: 'MONITOR_STATE', active: false }).catch(() => {});
  // Pending events (for example while offline) keep retrying via the alarm below.
  chrome.alarms.create('retry', { periodInMinutes: 1 });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const m = await get('monitor');
    const fromPage = !!sender.tab;
    switch (msg && msg.type) {
      case 'CONTENT_READY': {
        const ok = fromPage && m && m.active && formKey(sender.tab.url) === m.form_key &&
          (m.tab_id == null || m.tab_id === sender.tab.id);
        if (ok && m.tab_id == null) await set({ monitor: { ...m, tab_id: sender.tab.id, window_id: sender.tab.windowId, away: false } });
        return sendResponse(ok ? { active: true, idleThresholdSeconds: m.idle } : { active: false });
      }
      case 'ACTIVITY': {
        const t = Date.parse(msg.event_timestamp);
        if (fromPage && m && m.active && sender.tab.id === m.tab_id &&
            CONTENT_EVENTS.has(msg.event_type) && Number.isFinite(t)) {
          const dur = msg.details && Number(msg.details.duration_seconds);
          record(msg.event_type, Number.isFinite(dur) ? { duration_seconds: dur } : {}, new Date(t).toISOString());
        }
        return sendResponse({});
      }
      case 'START_MONITORING':
        return sendResponse(fromPage ? { ok: false } : await startMonitoring(msg));
      case 'END_MONITORING':
        if (!fromPage) await endMonitoring();
        return sendResponse({ ok: true });
      default:
        return sendResponse({});
    }
  })();
  return true; // async response
});

const setAway = (away, type) =>
  serial(async () => {
    const m = await get('monitor');
    if (!m || !m.active || m.away === away) return false;
    await set({ monitor: { ...m, away } });
    return true;
  }).then((changed) => changed && record(type));

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const m = await get('monitor');
  if (!m || !m.active || windowId !== m.window_id) return;
  if (tabId === m.tab_id) setAway(false, 'tab_returned');
  else setAway(true, 'tab_switched_away');
});

chrome.tabs.onCreated.addListener(async (tab) => {
  const m = await get('monitor');
  if (m && m.active && tab.id !== m.tab_id && tab.windowId === m.window_id) record('new_tab_opened');
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const m = await get('monitor');
  if (m && m.active && tabId === m.tab_id) {
    await record('page_hidden', { reason: 'tab_closed' });
    await set({ monitor: { ...(await get('monitor')), tab_id: null, away: true } });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  await flush();
  const m = await get('monitor');
  if (alarm.name === 'tick' && m && m.active && Date.now() > Date.parse(m.end_time) + 5 * 60000) {
    await endMonitoring(); // auto-end shortly after the scheduled end time
  }
  if (alarm.name === 'retry' && !((await get('queue')) || []).length) chrome.alarms.clear('retry');
});
