import { FormEvent, useState } from 'react';

import { API_URL, api, setApiUrl, setToken } from '../api';
import type { Me } from '../App';

export default function Login({ onLogin }: { onLogin: (u: Me) => void }) {
  const [email, setEmail] = useState('admin@smartroute.in');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState(API_URL);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setApiUrl(url);
      const res = await api.post<{ token: string; user: Me }>('/auth/login', { email, password });
      if (res.user.role !== 'admin') throw new Error('Only admin accounts can use the control room.');
      setToken(res.token);
      onLogin(res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-art">
        <div className="row" style={{ gap: 10 }}>
          <div className="brand-mark" style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#1b7f5a', color: '#fff', fontWeight: 800 }}>
            SR
          </div>
          <b style={{ fontSize: 18, color: '#fff' }}>SmartRoute Waste</b>
        </div>
        <div>
          <h1>Collect waste where it is — not where the schedule says.</h1>
          <ul>
            <li>● Live citizen pickup requests across Vellore</li>
            <li>● Capacity- and priority-aware route planning</li>
            <li>● Fleet tracking, SLA monitoring and recycling market</li>
          </ul>
        </div>
        <small style={{ color: '#7fa392' }}>VIT · Innovative Design Project</small>
      </div>
      <div className="login-form">
        <form onSubmit={submit}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800 }}>Control room login</h2>
            <p className="muted" style={{ marginTop: 4 }}>
              Municipal admin access
            </p>
          </div>
          {error && <div className="error">{error}</div>}
          <label className="field">
            Email
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            Password
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="admin123 for demo" autoComplete="current-password" />
          </label>
          <label className="field">
            API server
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <button className="btn primary" disabled={busy} style={{ justifyContent: 'center', padding: '11px 14px' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
