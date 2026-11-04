import { useState } from 'react';

import { fileUrl } from '../api';
import { URGENCY, WASTE, WASTE_ORDER, dt, kg, until } from '../meta';
import { Modal, PageHead, Status, Waste, useData } from '../ui';

const STATUS_FILTERS = [
  { key: 'pending,scheduled,in_progress', label: 'Open' },
  { key: 'pending', label: 'Pending' },
  { key: 'scheduled,in_progress', label: 'On a route' },
  { key: 'collected', label: 'Collected' },
  { key: 'cancelled,missed', label: 'Cancelled' },
  { key: '', label: 'All' },
];

export default function Requests() {
  const [status, setStatus] = useState(STATUS_FILTERS[0].key);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<any | null>(null);
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (type) params.set('waste_type', type);
  const { data, error } = useData<any[]>(`/admin/requests?${params.toString()}`, 15000);
  const rows = (data ?? []).filter((r) => !q || `${r.id} ${r.requester_name ?? ''} ${r.address ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHead title="Pickup requests" sub={`${rows.length} shown`}>
        <input className="input" placeholder="Search id, name, address…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {WASTE_ORDER.map((t) => (
            <option key={t} value={t}>
              {WASTE[t].label}
            </option>
          ))}
        </select>
      </PageHead>
      <div className="chips" style={{ marginBottom: 14 }}>
        {STATUS_FILTERS.map((f) => (
          <button key={f.label} className={`chip ${status === f.key ? 'on' : ''}`} onClick={() => setStatus(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Requested by</th>
              <th>Type</th>
              <th>Urgency</th>
              <th className="num">Est.</th>
              <th className="num">Actual</th>
              <th>Status</th>
              <th>SLA</th>
              <th className="num">Priority</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const late = ['pending', 'scheduled', 'in_progress'].includes(r.status) && new Date(r.sla_deadline).getTime() < Date.now();
              return (
                <tr key={r.id} onClick={() => setOpen(r)} style={{ cursor: 'pointer' }}>
                  <td className="faint">{r.id}</td>
                  <td>
                    <b>{r.requester_name}</b>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {r.address}
                    </div>
                  </td>
                  <td>
                    <Waste t={r.waste_type} />
                  </td>
                  <td>{URGENCY[r.urgency]}</td>
                  <td className="num">{kg(r.est_kg)}</td>
                  <td className="num">{kg(r.actual_kg)}</td>
                  <td>
                    <Status s={r.status} />
                  </td>
                  <td style={{ color: late ? 'var(--bad)' : undefined, fontWeight: late ? 700 : 400 }}>
                    {r.status === 'collected' ? (new Date(r.collected_at) <= new Date(r.sla_deadline) ? 'On time' : 'Late') : until(r.sla_deadline)}
                  </td>
                  <td className="num">{r.priority_score.toFixed(1)}</td>
                  <td className="faint">{dt(r.created_at)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="faint" style={{ textAlign: 'center', padding: 30 }}>
                  No requests match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {open && (
        <Modal title={`Request #${open.id}`} onClose={() => setOpen(null)}>
          <div className="grid" style={{ gap: 8 }}>
            {[
              ['Requested by', `${open.requester_name ?? '—'} · ${open.requester_phone ?? ''}`],
              ['Type', WASTE[open.waste_type]?.label],
              ['Urgency', URGENCY[open.urgency]],
              ['Estimated / actual', `${kg(open.est_kg)} / ${kg(open.actual_kg)}`],
              ['Status', open.status],
              ['Created', dt(open.created_at)],
              ['SLA deadline', dt(open.sla_deadline)],
              ['Collected', dt(open.collected_at)],
              ['Route', open.route_id ? `#${open.route_id}` : '—'],
              ['Address', open.address ?? '—'],
              ['Notes', open.notes ?? '—'],
              ['Skip reason', open.skip_reason ?? '—'],
              ['Credits awarded', String(open.credits_awarded)],
            ].map(([k, v]) => (
              <div key={k} className="row between" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                <span className="muted">{k}</span>
                <b style={{ textAlign: 'right' }}>{v}</b>
              </div>
            ))}
            <div className="row" style={{ gap: 10, marginTop: 6 }}>
              {open.photo_url && <img src={fileUrl(open.photo_url)} alt="citizen" style={{ width: '48%', borderRadius: 10 }} />}
              {open.proof_photo_url && <img src={fileUrl(open.proof_photo_url)} alt="proof" style={{ width: '48%', borderRadius: 10 }} />}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
