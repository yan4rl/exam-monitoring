const $ = (id) => document.getElementById(id);
const get = async (k) => (await chrome.storage.local.get(k))[k];

const LABELS = {
  tab_switched_away: 'Examination tab changed', tab_returned: 'Returned to examination tab',
  new_tab_opened: 'New tab opened', page_hidden: 'Examination page hidden',
  page_visible: 'Examination page visible', window_blur: 'Window lost focus',
  window_focus: 'Window regained focus', copy: 'Copy activity', paste: 'Paste activity',
  fullscreen_exit: 'Fullscreen exited', inactivity: 'Extended inactivity',
  connection_lost: 'Connection lost', connection_restored: 'Connection restored',
  monitoring_ended: 'Monitoring ended'
};

function show(view, msg) {
  ['view-login', 'view-start', 'view-active'].forEach((v) => ($(v).hidden = v !== view));
  $('msg').hidden = !msg;
  $('msg').textContent = msg || '';
}

async function route(msg) {
  if (CONFIG.SUPABASE_URL.includes('YOUR-')) return show(null, 'Set SUPABASE_URL and SUPABASE_ANON_KEY in config.js.');
  const auth = await get('auth');
  const monitor = await get('monitor');
  $('who').textContent = auth ? auth.email : '';
  if (!auth) return show('view-login', msg);
  if (monitor && monitor.active) { await renderActive(); return show('view-active', msg); }
  show('view-start', msg);
  await loadSessions();
}

async function loadSessions() {
  const sel = $('session');
  sel.replaceChildren();
  try {
    const rows = await API.rest('session_students?select=session_id,monitoring_status,monitoring_sessions(exam_title,start_time,end_time,status)');
    const now = Date.now();
    const usable = rows.filter((r) => r.monitoring_sessions &&
      ['scheduled', 'active'].includes(r.monitoring_sessions.status) &&
      r.monitoring_status !== 'ended' &&
      Date.parse(r.monitoring_sessions.end_time) + 15 * 60000 > now);
    usable.forEach((r) => {
      const o = document.createElement('option');
      o.value = r.session_id;
      o.textContent = `${r.monitoring_sessions.exam_title} (${new Date(r.monitoring_sessions.start_time).toLocaleString()})`;
      sel.appendChild(o);
    });
    if (!usable.length) {
      const o = document.createElement('option');
      o.textContent = 'No available sessions';
      o.value = '';
      sel.appendChild(o);
    }
  } catch (e) { $('msg').hidden = false; $('msg').textContent = e.message; }
  updateStart();
}

function updateStart() {
  $('btn-start').disabled = !($('consent').checked && $('session').value && $('code').value.trim().length === 8);
}

async function renderActive() {
  const m = await get('monitor');
  if (!m) return;
  $('exam').textContent = m.exam_title;
  $('pending').textContent = ((await get('queue')) || []).length;
  const ul = $('recent');
  ul.replaceChildren();
  const recent = (await get('recent')) || [];
  if (!recent.length) { const li = document.createElement('li'); li.textContent = 'None'; ul.appendChild(li); }
  recent.slice().reverse().forEach((r) => {
    const li = document.createElement('li');
    li.textContent = `${LABELS[r.event_type] || r.event_type} at ${new Date(r.at).toLocaleTimeString()}`;
    ul.appendChild(li);
  });
}

$('btn-login').addEventListener('click', async () => {
  try { await API.login($('email').value.trim(), $('password').value); $('password').value = ''; await route(); }
  catch (e) { show('view-login', e.message); }
});
$('btn-logout').addEventListener('click', async () => { await API.logout(); await route(); });
['consent', 'code', 'session'].forEach((id) => $(id).addEventListener('input', updateStart));
$('btn-start').addEventListener('click', async () => {
  $('btn-start').disabled = true;
  const res = await chrome.runtime.sendMessage({
    type: 'START_MONITORING', session_id: $('session').value, code: $('code').value.trim().toUpperCase()
  });
  if (res && res.ok) { $('code').value = ''; $('consent').checked = false; await route(); }
  else { show('view-start', (res && res.error) || 'Could not start monitoring.'); await loadSessions(); }
});
$('btn-end').addEventListener('click', async () => {
  if (!confirm('End monitoring? Do this only after you have submitted your Google Form.')) return;
  await chrome.runtime.sendMessage({ type: 'END_MONITORING' });
  await route('Monitoring ended.');
});

setInterval(async () => { const m = await get('monitor'); if (m && m.active) renderActive(); }, 2000);
route();
