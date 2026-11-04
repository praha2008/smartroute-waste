import { useState } from 'react';

import { api, setToken } from '../api';
import { dt } from '../meta';
import { Icon, Modal, PageHead, useData } from '../ui';

const ROLES = [
  ['citizen', 'Citizens'],
  ['collector', 'Collectors'],
  ['recycler', 'Recyclers'],
  ['admin', 'Admins'],
];

export default function Users() {
  const [role, setRole] = useState('citizen');
  const { data, error, reload } = useData<any[]>(`/admin/users?role=${role}`);
  const [form, setForm] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetMode, setResetMode] = useState<'clean' | 'full'>('clean');

  const resetDemo = async () => {
    setResetting(true);
    setErr(null);
    try {
      await api.post(`/admin/reset-demo?confirm=RESET&mode=${resetMode}`);
      setToken(null);
      window.location.hash = '#/overview';
      window.location.reload();
    } catch (e: any) {
      setErr(e.message);
      setResetting(false);
    }
  };

  const save = async () => {
    setErr(null);
    try {
      await api.post('/admin/users', form);
      setForm(null);
      setRole(form.role);
      reload();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <>
      <PageHead title="Users" sub="Waste generators, collection staff and recycling partners">
        <button className="btn danger" onClick={() => { setConfirmText(''); setErr(null); setResetOpen(true); }}>
          Reset demo data
        </button>
        <button className="btn primary" onClick={() => setForm({ name: '', email: '', phone: '', password: '', role: 'collector' })}>
          <Icon name="plus" /> Add staff account
        </button>
      </PageHead>
      <div className="chips" style={{ marginBottom: 14 }}>
        {ROLES.map(([k, l]) => (
          <button key={k} className={`chip ${role === k ? 'on' : ''}`} onClick={() => setRole(k)}>
            {l}
          </button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              {role === 'citizen' && <th>Type</th>}
              <th>Ward</th>
              {role === 'citizen' && <th className="num">Credits</th>}
              {role === 'citizen' && <th className="num">Reliability</th>}
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.name}</b>
                  {u.organization && u.organization !== u.name && <div className="faint">{u.organization}</div>}
                </td>
                <td>{u.email}</td>
                <td>{u.phone ?? '—'}</td>
                {role === 'citizen' && <td>{u.account_type}</td>}
                <td>{u.ward ?? '—'}</td>
                {role === 'citizen' && <td className="num">{u.green_credits}</td>}
                {role === 'citizen' && <td className="num">{Math.round(u.reliability * 100)}%</td>}
                <td className="faint">{dt(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resetOpen && (
        <Modal title="Reset demo data" onClose={() => !resetting && setResetOpen(false)}>
          {err && <div className="error">{err}</div>}
          <p style={{ marginTop: 0 }}>
            This <b>deletes everything</b> (requests, routes, credits, photos) and recreates the demo accounts and fleet.
            Everyone on every app will be logged out.
          </p>
          <div className="grid" style={{ gap: 8, marginBottom: 14 }}>
            <label className={`card reset-opt ${resetMode === 'clean' ? 'on' : ''}`}>
              <input type="radio" name="mode" checked={resetMode === 'clean'} onChange={() => setResetMode('clean')} />
              <div>
                <b>Clean start</b> <span className="badge tone-good">recommended for live demo</span>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Accounts + 5 vehicles only. Zero requests: create them live from the citizen app.
                </div>
              </div>
            </label>
            <label className={`card reset-opt ${resetMode === 'full' ? 'on' : ''}`}>
              <input type="radio" name="mode" checked={resetMode === 'full'} onChange={() => setResetMode('full')} />
              <div>
                <b>Full sample dataset</b>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Adds 30 days of history (charts, analytics) and 38 open requests. Takes ~1–2 min online.
                </div>
              </div>
            </label>
          </div>
          <label className="field">
            Type RESET to confirm
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn" onClick={() => setResetOpen(false)} disabled={resetting}>
              Cancel
            </button>
            <button className="btn primary" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} disabled={confirmText !== 'RESET' || resetting} onClick={resetDemo}>
              {resetting ? 'Resetting…' : resetMode === 'clean' ? 'Delete everything & start clean' : 'Delete everything & load sample data'}
            </button>
          </div>
        </Modal>
      )}
      {form && (
        <Modal title="Add staff account" onClose={() => setForm(null)}>
          {err && <div className="error">{err}</div>}
          <div className="form-grid">
            {[
              ['name', 'Full name'],
              ['email', 'Email'],
              ['phone', 'Phone'],
              ['password', 'Temporary password'],
            ].map(([k, l]) => (
              <label key={k} className="field">
                {l}
                <input className="input" type={k === 'password' ? 'password' : 'text'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </label>
            ))}
            <label className="field full">
              Role
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="collector">Collector (driver)</option>
                <option value="recycler">Recycler</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <p className="faint">After creating a collector, assign them a vehicle on the Fleet page.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" onClick={save}>
              Create
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
