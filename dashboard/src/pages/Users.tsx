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

type ResetMode = 'clean' | 'full' | 'release';

function Status({ u }: { u: any }) {
  const tags: [string, string][] = [];
  if (u.is_active === false) tags.push(['Disabled', 'tone-bad']);
  if (u.role === 'recycler' && u.approved === false) tags.push(['Waiting approval', 'tone-warn']);
  if (u.phone_verified === false) tags.push(['Phone not verified', 'tone-warn']);
  if (u.must_change_password) tags.push(['Temp password', 'tone-info']);
  if (!tags.length) tags.push(['Active', 'tone-good']);
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {tags.map(([l, c]) => (
        <span key={l} className={`badge ${c}`}>
          {l}
        </span>
      ))}
    </div>
  );
}

export default function Users() {
  const [role, setRole] = useState('citizen');
  const { data, error, reload } = useData<any[]>(`/admin/users?role=${role}`);
  const meta = useData<any>('/meta');
  const release = meta.data?.app_mode === 'release';
  const [form, setForm] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [working, setWorking] = useState(false);
  const [resetMode, setResetMode] = useState<ResetMode>('clean');
  const [tempPw, setTempPw] = useState<{ name: string; email: string; phone: string; password: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const resetDemo = async () => {
    setWorking(true);
    setErr(null);
    try {
      await api.post(`/admin/reset-demo?confirm=RESET&mode=${resetMode}`);
      setToken(null);
      window.location.hash = '#/overview';
      window.location.reload();
    } catch (e: any) {
      setErr(e.message);
      setWorking(false);
    }
  };

  const clearOps = async () => {
    setWorking(true);
    setErr(null);
    try {
      await api.post('/admin/clear-operations?confirm=CLEAR');
      setClearOpen(false);
      reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setWorking(false);
    }
  };

  const act = async (u: any, action: 'approve' | 'disable' | 'enable') => {
    if (action === 'disable' && !window.confirm(`Disable ${u.name}? They will not be able to log in.`)) return;
    setBusyId(u.id);
    try {
      await api.post(`/admin/users/${u.id}/set/${action}`);
      reload();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (u: any) => {
    if (!window.confirm(`Create a new temporary password for ${u.name}? Their old password stops working.`)) return;
    setBusyId(u.id);
    try {
      const r = await api.post<{ temporary_password: string }>(`/admin/users/${u.id}/reset-password`);
      setTempPw({ name: u.name, email: u.email, phone: u.phone, password: r.temporary_password });
      reload();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const save = async () => {
    setErr(null);
    try {
      const created = await api.post<any>('/admin/users', form);
      setTempPw({ name: created.name, email: created.email, phone: created.phone, password: form.password });
      setForm(null);
      setRole(form.role);
      reload();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const pending = role === 'recycler' ? (data ?? []).filter((u) => u.approved === false).length : 0;

  return (
    <>
      <PageHead title="Users" sub="Citizens, collection staff and recycling partners">
        <button className="btn danger" onClick={() => { setConfirmText(''); setErr(null); setClearOpen(true); }}>
          Clear operations
        </button>
        <button className="btn danger" onClick={() => { setConfirmText(''); setErr(null); setResetMode(release ? 'release' : 'clean'); setResetOpen(true); }}>
          Reset data
        </button>
        <button className="btn primary" onClick={() => setForm({ name: '', email: '', phone: '', password: `SR-${Math.random().toString(36).slice(2, 8)}`, role: 'collector' })}>
          <Icon name="plus" /> Add staff account
        </button>
      </PageHead>

      {meta.data && (
        <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className={`badge ${release ? 'tone-good' : 'tone-info'}`}>{release ? 'Release mode' : 'Demo mode'}</span>
          <span className={`badge ${meta.data.sms_live ? 'tone-good' : 'tone-warn'}`}>SMS codes: {meta.data.sms_live ? 'live (Twilio)' : 'shown on screen'}</span>
          <span className={`badge ${meta.data.email_live ? 'tone-good' : 'tone-warn'}`}>Reset emails: {meta.data.email_live ? 'live' : 'shown on screen'}</span>
        </div>
      )}

      <div className="chips" style={{ marginBottom: 14 }}>
        {ROLES.map(([k, l]) => (
          <button key={k} className={`chip ${role === k ? 'on' : ''}`} onClick={() => setRole(k)}>
            {l}
          </button>
        ))}
      </div>
      {pending > 0 && <div className="error" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>{pending} recycler account(s) waiting for your approval.</div>}
      {error && <div className="error">{error}</div>}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              {role === 'citizen' && <th>Type</th>}
              <th>Ward</th>
              {role === 'citizen' && <th className="num">Credits</th>}
              <th>Status</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="faint" style={{ textAlign: 'center', padding: 24 }}>
                  No accounts yet.
                </td>
              </tr>
            )}
            {(data ?? []).map((u) => (
              <tr key={u.id} style={u.is_active === false ? { opacity: 0.55 } : undefined}>
                <td>
                  <b>{u.name}</b>
                  {u.organization && u.organization !== u.name && <div className="faint">{u.organization}</div>}
                </td>
                <td>
                  <div>{u.phone ?? '—'}</div>
                  <div className="faint">{u.email}</div>
                </td>
                {role === 'citizen' && <td>{u.account_type}</td>}
                <td>{u.ward ?? '—'}</td>
                {role === 'citizen' && <td className="num">{u.green_credits}</td>}
                <td>
                  <Status u={u} />
                </td>
                <td className="faint">{dt(u.created_at)}</td>
                <td>
                  <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    {u.role === 'recycler' && u.approved === false && (
                      <button className="btn small primary" disabled={busyId === u.id} onClick={() => act(u, 'approve')}>
                        Approve
                      </button>
                    )}
                    {u.role !== 'admin' && (
                      <button className="btn small" disabled={busyId === u.id} onClick={() => resetPassword(u)}>
                        Reset password
                      </button>
                    )}
                    {u.role !== 'admin' &&
                      (u.is_active === false ? (
                        <button className="btn small" disabled={busyId === u.id} onClick={() => act(u, 'enable')}>
                          Enable
                        </button>
                      ) : (
                        <button className="btn small danger" disabled={busyId === u.id} onClick={() => act(u, 'disable')}>
                          Disable
                        </button>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tempPw && (
        <Modal title="Temporary password" onClose={() => setTempPw(null)}>
          <p style={{ marginTop: 0 }}>
            Give these login details to <b>{tempPw.name}</b>. They will be asked to set their own password on first login.
          </p>
          <div className="card" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 15, lineHeight: 1.8 }}>
            Login: {tempPw.phone || tempPw.email}
            <br />
            Password: <b>{tempPw.password}</b>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(`Login: ${tempPw.phone || tempPw.email}\nPassword: ${tempPw.password}`)}>
              Copy
            </button>
            <button className="btn primary" onClick={() => setTempPw(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}

      {clearOpen && (
        <Modal title="Clear operations" onClose={() => !working && setClearOpen(false)}>
          {err && <div className="error">{err}</div>}
          <p style={{ marginTop: 0 }}>
            Deletes all <b>pickup requests, routes, recycler lots, credits and photos</b>. Keeps every account and vehicle, so people stay logged in. Use it to
            start a fresh live demo.
          </p>
          <label className="field">
            Type CLEAR to confirm
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn" onClick={() => setClearOpen(false)} disabled={working}>
              Cancel
            </button>
            <button className="btn primary" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} disabled={confirmText !== 'CLEAR' || working} onClick={clearOps}>
              {working ? 'Clearing…' : 'Clear all operations'}
            </button>
          </div>
        </Modal>
      )}

      {resetOpen && (
        <Modal title="Reset data" onClose={() => !working && setResetOpen(false)}>
          {err && <div className="error">{err}</div>}
          <p style={{ marginTop: 0 }}>
            This <b>deletes everything</b>, including accounts, and logs everyone out of every app.
          </p>
          <div className="grid" style={{ gap: 8, marginBottom: 14 }}>
            {(
              [
                ['release', 'Release start', 'Only the admin account and the fleet (no drivers, no citizens). Real users sign up with their phones.', 'for the final project'],
                ['clean', 'Demo accounts, no requests', 'Demo logins (citizen, driver1–5, recycler) + 5 vehicles. Create requests live.', 'for a quick demo'],
                ['full', 'Full sample dataset', '30 days of history and 38 open requests. Takes 1–2 min online.', ''],
              ] as [ResetMode, string, string, string][]
            ).map(([k, title, desc, tag]) => {
              const disabled = release && k !== 'release';
              return (
                <label key={k} className={`card reset-opt ${resetMode === k ? 'on' : ''}`} style={disabled ? { opacity: 0.45 } : undefined}>
                  <input type="radio" name="mode" disabled={disabled} checked={resetMode === k} onChange={() => setResetMode(k)} />
                  <div>
                    <b>{title}</b> {tag && <span className="badge tone-good">{tag}</span>}
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {desc}
                      {disabled ? ' (not allowed: server runs in release mode)' : ''}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <label className="field">
            Type RESET to confirm
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn" onClick={() => setResetOpen(false)} disabled={working}>
              Cancel
            </button>
            <button className="btn primary" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} disabled={confirmText !== 'RESET' || working} onClick={resetDemo}>
              {working ? 'Resetting…' : 'Delete everything & reset'}
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
              ['phone', 'Mobile number'],
              ['email', 'Email'],
              ['password', 'Temporary password'],
            ].map(([k, l]) => (
              <label key={k} className="field">
                {l}
                <input className="input" type="text" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
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
          <p className="faint">They log in with the mobile number or email and must change the temporary password on first login. Assign collectors a vehicle on the Fleet page.</p>
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
