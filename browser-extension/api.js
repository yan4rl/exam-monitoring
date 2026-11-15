// Shared by background.js (importScripts) and popup.js (script tag).
const API = (() => {
  const U = CONFIG.SUPABASE_URL;
  const K = CONFIG.SUPABASE_ANON_KEY;
  const get = async (k) => (await chrome.storage.local.get(k))[k];
  const set = (o) => chrome.storage.local.set(o);

  const saveAuth = (d, fallbackEmail) =>
    set({
      auth: {
        access_token: d.access_token,
        refresh_token: d.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + d.expires_in,
        email: (d.user && d.user.email) || fallbackEmail
      }
    });

  async function login(email, password) {
    const r = await fetch(`${U}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: K, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || d.msg || 'Sign in failed');
    await saveAuth(d, email);
  }

  async function token() {
    const a = await get('auth');
    if (!a) throw new Error('Not signed in');
    if (a.expires_at - 60 > Date.now() / 1000) return a.access_token;
    const r = await fetch(`${U}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: K, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: a.refresh_token })
    });
    const d = await r.json();
    if (!r.ok) throw new Error('Session expired. Please sign in again.');
    await saveAuth(d, a.email);
    return d.access_token;
  }

  async function callFunction(name, body) {
    const r = await fetch(`${U}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: K, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    let data = null;
    try { data = await r.json(); } catch (_) {}
    return { ok: r.ok, status: r.status, data };
  }

  async function rest(path) {
    const r = await fetch(`${U}/rest/v1/${path}`, {
      headers: { apikey: K, Authorization: `Bearer ${await token()}` },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('Could not load sessions');
    return r.json();
  }

  const logout = () => chrome.storage.local.remove('auth');
  return { login, logout, callFunction, rest };
})();
