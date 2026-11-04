import { useState } from 'react';

import { api } from '../api';
import { WASTE, WASTE_ORDER, dt, kg } from '../meta';
import { Icon, Modal, PageHead, Status, useData } from '../ui';

const DEPOT: [number, number] = [12.9249, 79.1353];

interface VForm {
  id?: number;
  reg_no: string;
  name: string;
  capacity_kg: number;
  allowed_types: string[];
  depot_lat: number;
  depot_lng: number;
  driver_id: number | null;
}

export default function Fleet() {
  const { data: vehicles, error, reload } = useData<any[]>('/admin/vehicles', 15000);
  const { data: drivers } = useData<any[]>('/admin/users?role=collector');
  const [form, setForm] = useState<VForm | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!form) return;
    setErr(null);
    try {
      const body = { ...form, capacity_kg: Number(form.capacity_kg) };
      delete (body as any).id;
      if (form.id) await api.put(`/admin/vehicles/${form.id}`, body);
      else await api.post('/admin/vehicles', body);
      setForm(null);
      reload();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const toggleOffline = async (v: any) => {
    await api.post(`/admin/vehicles/${v.id}/status/${v.status === 'offline' ? 'idle' : 'offline'}`);
    reload();
  };

  return (
    <>
      <PageHead title="Fleet" sub="Vehicles, capacities, allowed waste types and assigned drivers">
        <button className="btn primary" onClick={() => setForm({ reg_no: '', name: '', capacity_kg: 1000, allowed_types: ['general'], depot_lat: DEPOT[0], depot_lng: DEPOT[1], driver_id: null })}>
          <Icon name="plus" /> Add vehicle
        </button>
      </PageHead>
      {error && <div className="error">{error}</div>}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th className="num">Capacity</th>
              <th>Allowed waste</th>
              <th>Driver</th>
              <th>Status</th>
              <th>Last GPS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(vehicles ?? []).map((v) => (
              <tr key={v.id}>
                <td>
                  <b>{v.name}</b>
                  <div className="faint">{v.reg_no}</div>
                </td>
                <td className="num">{kg(v.capacity_kg)}</td>
                <td>
                  <div className="row wrap" style={{ gap: 4 }}>
                    {v.allowed_types.split(',').map((t: string) => (
                      <span key={t} className="badge" style={{ background: WASTE[t]?.soft, color: WASTE[t]?.color }}>
                        {WASTE[t]?.label ?? t}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{v.driver_name ?? <span className="faint">Unassigned</span>}</td>
                <td>
                  <Status s={v.status} />
                </td>
                <td className="faint">{dt(v.last_seen)}</td>
                <td>
                  <div className="row">
                    <button
                      className="btn small"
                      onClick={() =>
                        setForm({ id: v.id, reg_no: v.reg_no, name: v.name, capacity_kg: v.capacity_kg, allowed_types: v.allowed_types.split(','), depot_lat: v.depot_lat, depot_lng: v.depot_lng, driver_id: v.driver_id })
                      }
                    >
                      Edit
                    </button>
                    {v.status !== 'on_route' && (
                      <button className="btn small" onClick={() => toggleOffline(v)}>
                        {v.status === 'offline' ? 'Set available' : 'Set offline'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.id ? 'Edit vehicle' : 'Add vehicle'} onClose={() => setForm(null)}>
          {err && <div className="error">{err}</div>}
          <div className="form-grid">
            <label className="field">
              Registration no.
              <input className="input" value={form.reg_no} onChange={(e) => setForm({ ...form, reg_no: e.target.value })} placeholder="TN23 AB 1234" />
            </label>
            <label className="field">
              Name
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Compactor 3" />
            </label>
            <label className="field">
              Capacity (kg)
              <input className="input" type="number" value={form.capacity_kg} onChange={(e) => setForm({ ...form, capacity_kg: Number(e.target.value) })} />
            </label>
            <label className="field">
              Driver
              <select className="input" value={form.driver_id ?? ''} onChange={(e) => setForm({ ...form, driver_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— none —</option>
                {(drivers ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.employee_id ?? d.email})
                  </option>
                ))}
              </select>
            </label>
            <div className="field full">
              Allowed waste types
              <div className="chips">
                {WASTE_ORDER.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={`chip ${form.allowed_types.includes(t) ? 'on' : ''}`}
                    onClick={() =>
                      setForm({ ...form, allowed_types: form.allowed_types.includes(t) ? form.allowed_types.filter((x) => x !== t) : [...form.allowed_types, t] })
                    }
                  >
                    {WASTE[t].label}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              Depot latitude
              <input className="input" type="number" step="0.0001" value={form.depot_lat} onChange={(e) => setForm({ ...form, depot_lat: Number(e.target.value) })} />
            </label>
            <label className="field">
              Depot longitude
              <input className="input" type="number" step="0.0001" value={form.depot_lng} onChange={(e) => setForm({ ...form, depot_lng: Number(e.target.value) })} />
            </label>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={save} disabled={!form.reg_no || !form.name || form.allowed_types.length === 0}>
              Save
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
