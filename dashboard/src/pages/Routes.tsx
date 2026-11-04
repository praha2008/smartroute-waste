import { useState } from 'react';

import { api } from '../api';
import { dt, kg, km } from '../meta';
import { PageHead, Status, Waste, useData } from '../ui';

export default function RoutesPage() {
  const [filter, setFilter] = useState('planned,active');
  const { data, error, reload } = useData<any[]>(`/admin/routes${filter ? `?status=${filter}` : ''}`, 15000);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <PageHead title="Routes" sub="Every route produced by the planner, with its stop sequence">
        <div className="chips">
          {[
            ['planned,active', 'Current'],
            ['completed', 'Completed'],
            ['', 'All'],
          ].map(([k, l]) => (
            <button key={l} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
      </PageHead>
      {error && <div className="error">{error}</div>}
      <div className="grid" style={{ gap: 12 }}>
        {(data ?? []).length === 0 && <div className="card card-pad faint">No routes in this view.</div>}
        {(data ?? []).map((r) => {
          const done = r.stops.filter((s: any) => s.status === 'done');
          const util = (r.total_kg / r.vehicle.capacity_kg) * 100;
          return (
            <div key={r.id} className="card">
              <div className="card-pad row between wrap" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === r.id ? null : r.id)}>
                <div>
                  <div className="row">
                    <b style={{ fontSize: 16 }}>Route #{r.id}</b>
                    <Status s={r.status} />
                    <span className="badge tone-neutral">{r.planner}</span>
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    {r.vehicle.name} ({r.vehicle.reg_no}) · {r.vehicle.driver_name ?? 'no driver'} · created {dt(r.created_at)}
                  </div>
                </div>
                <div className="row" style={{ gap: 24 }}>
                  <div>
                    <div className="faint" style={{ fontSize: 11 }}>STOPS</div>
                    <b>
                      {done.length}/{r.stops.length}
                    </b>
                  </div>
                  <div>
                    <div className="faint" style={{ fontSize: 11 }}>DISTANCE</div>
                    <b>{km(r.total_km)}</b>
                  </div>
                  <div>
                    <div className="faint" style={{ fontSize: 11 }}>LOAD</div>
                    <b>
                      {kg(r.total_kg)} <span className="faint">({util.toFixed(0)}%)</span>
                    </b>
                  </div>
                  {r.status === 'planned' && (
                    <button
                      className="btn small danger"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await api.del(`/admin/routes/${r.id}`);
                        reload();
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
              {open === r.id && (
                <div className="table-wrap" style={{ borderTop: '1px solid var(--line)' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Seq</th>
                        <th>Request</th>
                        <th>Type</th>
                        <th className="num">Leg</th>
                        <th className="num">Est.</th>
                        <th className="num">Actual</th>
                        <th>ETA</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.stops.map((s: any) => (
                        <tr key={s.id}>
                          <td>
                            <b>{s.seq}</b>
                          </td>
                          <td>
                            #{s.request.id} {s.request.requester_name}
                            <div className="faint" style={{ fontSize: 12 }}>
                              {s.request.address}
                            </div>
                          </td>
                          <td>
                            <Waste t={s.request.waste_type} />
                          </td>
                          <td className="num">{km(s.leg_km)}</td>
                          <td className="num">{kg(s.request.est_kg)}</td>
                          <td className="num">{kg(s.request.actual_kg)}</td>
                          <td>{dt(s.eta)}</td>
                          <td>
                            <Status s={s.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
