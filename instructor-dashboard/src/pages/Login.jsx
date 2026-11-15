import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', studentNumber: '', email: '', password: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (mode === 'register' && (f.name.trim().length < 2 || f.password.length < 8)) {
      return setMsg('Enter your full name and a password of at least 8 characters.');
    }
    setBusy(true);
    const { error } = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password })
      : await supabase.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { full_name: f.name.trim(), student_number: f.studentNumber.trim() } } });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === 'register') setMsg('Account created. If email confirmation is enabled, confirm your email and then sign in.');
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-12">
      <h1>Exam Behavior Monitoring</h1>
      <p className="mb-4">{mode === 'login' ? 'Sign in' : 'Create an account'}</p>
      <form onSubmit={submit} className="panel">
        {mode === 'register' && (<div className="mb-3"><label htmlFor="name">Full name</label>
          <input id="name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>)}
        {mode === 'register' && (<div className="mb-3"><label htmlFor="sn">Student number (students only)</label>
          <input id="sn" className="input" value={f.studentNumber} onChange={(e) => setF({ ...f, studentNumber: e.target.value })} /></div>)}
        <div className="mb-3"><label htmlFor="email">Email</label>
          <input id="email" type="email" required className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="mb-3"><label htmlFor="pw">Password</label>
          <input id="pw" type="password" required className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        {mode === 'register' && <p className="text-xs mb-3">Accounts with an email on the instructor allowlist become instructors and use this dashboard. All other accounts are student accounts and sign in through the browser extension.</p>}
        {msg && <p className="alert">{msg}</p>}
        <button className="btn w-full" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Register'}</button>
      </form>
      <button className="underline text-peri" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMsg(''); }}>
        {mode === 'login' ? 'Create an account' : 'Back to sign in'}
      </button>
    </div>
  );
}
