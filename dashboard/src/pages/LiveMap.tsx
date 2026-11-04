import { useMemo, useState } from 'react';

import { api } from '../api';
import LeafletMap, { LineSpec, MarkerSpec, PolySpec } from '../components/LeafletMap';
import { URGENCY, WASTE, WASTE_ORDER, kg, km, until } from '../meta';
import { Icon, PageHead, Status, useData } from '../ui';

interface LiveReq {
  id: number;
  waste_type: string;
  urgency: string;
  est_kg: number;
  lat: number;
  lng: number;
  address: string | null;
  status: string;
  priority_score: number;
  sla_deadline: string;
  route_id: number | null;
  cluster_id: number | null;
}
interface LiveVehicle {
  id: number;
  name: string;
  reg_no: string;
  capacity_kg: number;
  allowed_types: string;
  depot_lat: number;
  depot_lng: number;
  status: string;
  cur_lat: number | null;
  cur_lng: number | null;
  driver_name: string | null;
}
interface LiveRoute {
  id: number;
  vehicle_id: number;
  status: string;
  planner: string;
  total_km: number;
  path: [number, number][];
  stops: { seq: number; status: string; request_id: number }[];
}
interface Live {
  requests: LiveReq[];
  vehicles: LiveVehicle[];
  routes: LiveRoute[];
}

// route colours: distinct from waste-type colours so lines never read as a waste type
const ROUTE_COLORS = ['#0f1f19', '#d0640f', '#0e7c86', '#b0307a', '#5a6b00', '#3b4cc0'];
const CLUSTER_COLOR = '#0e7c86';

interface PlanResult {
  planner: string;
  planner_label: string;
  routes_created: number;
  requests_scheduled: number;
  requests_left: number;
  deferred: number;
  dropped: number;
  clusters: number;
  total_km: number;
  km_per_pickup: number | null;
  distance_source: string;
  solve_seconds: number;
  notes: string[];
}

/** Convex hull (monotone chain) of a padded point set, used to outline DBSCAN communities. */
function hull(points: [number, number][]): [number, number][] {
  const pad = 0.0012; // ~130 m around each request
  const pts = points
    .flatMap(([a, b]) => [[a + pad, b], [a - pad, b], [a, b + pad], [a, b - pad]] as [number, number][])
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export default function LiveMap() {
  const { data, error, reload } = useData<Live>('/admin/live', 8000);
  const [selected, setSelected] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState('init');
  const [types, setTypes] = useState<string[]>(WASTE_ORDER);
  const [planner, setPlanner] = useState<'smart' | 'greedy'>('smart');
  const [defer, setDefer] = useState(true);
  const [eps, setEps] = useState(0.6);
  const [minS, setMinS] = useState(3);
  const [result, setResult] = useState<PlanResult | null>(null);

  const vehicleById = useMemo(() => new Map((data?.vehicles ?? []).map((v) => [v.id, v])), [data]);
  const routeColor = (rid: number) => {
    const idx = (data?.routes ?? []).findIndex((r) => r.id === rid);
    return ROUTE_COLORS[(idx >= 0 ? idx : rid) % ROUTE_COLORS.length];
  };

  const { markers, lines, polygons } = useMemo(() => {
    const markers: MarkerSpec[] = [];
    const lines: LineSpec[] = [];
    const polygons: PolySpec[] = [];
    if (!data) return { markers, lines, polygons };
    const groups = new Map<number, [number, number][]>();
    for (const q of data.requests) {
      if (q.cluster_id == null || q.status === 'in_progress') continue;
      if (!groups.has(q.cluster_id)) groups.set(q.cluster_id, []);
      groups.get(q.cluster_id)!.push([q.lat, q.lng]);
    }
    for (const [cid, pts] of groups) {
      polygons.push({ id: `c${cid}`, points: hull(pts), color: CLUSTER_COLOR, label: `Community ${cid + 1} · ${pts.length} requests` });
    }
    const depots = new Set<string>();
    for (const v of data.vehicles) {
      const key = `${v.depot_lat},${v.depot_lng}`;
      if (!depots.has(key)) {
        depots.add(key);
        markers.push({ id: `depot${v.id}`, lat: v.depot_lat, lng: v.depot_lng, html: '<div class="depot">D</div>', size: [26, 26], popup: 'Municipal depot', z: 500 });
      }
      if (v.cur_lat && v.cur_lng && v.status === 'on_route') {
        markers.push({ id: `veh${v.id}`, lat: v.cur_lat, lng: v.cur_lng, html: '<div class="truck">🚛</div>', size: [30, 30], popup: `${v.name} · ${v.driver_name ?? ''}`, z: 1000 });
      }
    }
    for (const r of data.routes) {
      const dim = selected !== null && selected !== r.id;
      lines.push({ id: `r${r.id}`, points: r.path, color: routeColor(r.id), weight: selected === r.id ? 5 : 3, opacity: dim ? 0.15 : 0.85, dashed: r.status === 'planned' });
    }
    const seqOf = new Map<number, number>();
    for (const r of data.routes) for (const s of r.stops) seqOf.set(s.request_id, s.seq);
    for (const q of data.requests) {
      if (!types.includes(q.waste_type)) continue;
      const w = WASTE[q.waste_type] ?? WASTE.general;
      const late = new Date(q.sla_deadline).getTime() < Date.now();
      const size = q.urgency === 'critical' ? 24 : q.urgency === 'high' ? 21 : 18;
      const label = seqOf.get(q.id) ?? '';
      const dim = selected !== null && q.route_id !== selected;
      const waiting = q.status === 'pending' && q.cluster_id == null && !!result && result.planner !== 'greedy';
      markers.push({
        id: `q${q.id}`,
        lat: q.lat,
        lng: q.lng,
        size: [size, size],
        z: Math.round(q.priority_score * 10),
        html: `<div class="pin" style="width:${size}px;height:${size}px;background:${waiting ? '#fff' : w.color};${waiting ? `border:3px solid ${w.color};` : ''}opacity:${dim ? 0.3 : 1};${late ? 'outline:2px solid #c62828;outline-offset:1px;' : ''}${q.status === 'pending' || waiting ? '' : 'border-color:#12201a;'}">${label}</div>`,
        popup: `<b>#${q.id} ${w.label}</b> · ${kg(q.est_kg)}<br/>${URGENCY[q.urgency]} urgency · ${until(q.sla_deadline)}<br/>${waiting ? 'waiting for nearby requests (not urgent)' : q.status}${q.cluster_id != null ? ` · community ${q.cluster_id + 1}` : ''}${q.address ? `<br/>${q.address}` : ''}`,
        onClick: () => q.route_id && setSelected(q.route_id),
      });
    }
    return { markers, lines, polygons };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selected, types, result]);

  const pending = (data?.requests ?? []).filter((r) => r.status === 'pending');
  const pendingKg = pending.reduce((a, r) => a + r.est_kg, 0);

  const plan = async () => {
    setPlanning(true);
    setMsg(null);
    setPlanErr(null);
    try {
      const q = new URLSearchParams({ planner, defer: String(defer), eps_km: String(eps), min_samples: String(minS) });
      const res = await api.post<PlanResult>(`/admin/plan?${q.toString()}`);
      setResult(res);
      setMsg(
        res.routes_created
          ? `${res.planner_label}: ${res.routes_created} route(s) · ${res.requests_scheduled} pickups · ${km(res.total_km)} total.`
          : 'Nothing to plan — no pending requests or all vehicles are busy.',
      );
      await reload();
      setFitKey(String(Date.now()));
    } catch (e: any) {
      setPlanErr(e.message);
    } finally {
      setPlanning(false);
    }
  };

  const cancelRoute = async (id: number) => {
    try {
      await api.del(`/admin/routes/${id}`);
      setSelected(null);
      reload();
    } catch (e: any) {
      setPlanErr(e.message);
    }
  };

  return (
    <>
      <PageHead title="Live map & planning" sub={`${pending.length} pending requests (${kg(pendingKg)}) · auto-refresh every 8 s`}>
        <div className="chips">
          {WASTE_ORDER.map((t) => (
            <button key={t} className={`chip ${types.includes(t) ? 'on' : ''}`} onClick={() => setTypes((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))}>
              {WASTE[t].label}
            </button>
          ))}
        </div>
      </PageHead>
      <div className="card card-pad plan-bar">
        <label className="field">
          Planner
          <select className="input" value={planner} onChange={(e) => setPlanner(e.target.value as 'smart' | 'greedy')}>
            <option value="smart">SmartRoute · DBSCAN + CVRP</option>
            <option value="greedy">Baseline · greedy nearest-neighbour</option>
          </select>
        </label>
        {planner === 'smart' && (
          <>
            <label className="field">
              Community radius (km)
              <input className="input" type="number" step="0.1" min="0.1" max="5" value={eps} onChange={(e) => setEps(Number(e.target.value))} />
            </label>
            <label className="field">
              Min requests / community
              <input className="input" type="number" min="2" max="20" value={minS} onChange={(e) => setMinS(Number(e.target.value))} />
            </label>
            <label className="check">
              <input type="checkbox" checked={defer} onChange={(e) => setDefer(e.target.checked)} />
              Hold isolated non-urgent requests
            </label>
          </>
        )}
        <button className="btn primary" onClick={plan} disabled={planning} style={{ marginLeft: 'auto' }}>
          <Icon name="play" /> {planning ? 'Optimising…' : 'Plan routes now'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {planErr && <div className="error">{planErr}</div>}
      {msg && <div className="notice">{msg}</div>}

      <div className="map-layout">
        <div className="map-box">
          <LeafletMap markers={markers} lines={lines} polygons={polygons} fitKey={fitKey} />
          <div className="map-legend">
            {WASTE_ORDER.map((k) => (
              <span key={k} className="row" style={{ gap: 6 }}>
                <span className="swatch" style={{ background: WASTE[k].color, borderRadius: '50%' }} />
                {WASTE[k].label}
              </span>
            ))}
            <span className="row" style={{ gap: 6 }}>
              <span className="swatch" style={{ border: `1.5px dashed ${CLUSTER_COLOR}`, background: 'transparent' }} />
              DBSCAN community
            </span>
            <span className="faint">Bigger pin = higher urgency · hollow = waiting for neighbours · red ring = past SLA · number = stop order · dashed line = not started</span>
          </div>
        </div>
        <div className="panel">
          {result && (
            <div className="card card-pad">
              <div className="card-title">Last plan · {result.planner === 'greedy' ? 'Baseline' : 'SmartRoute'}</div>
              <div className="stat-grid">
                <div><b>{result.routes_created}</b><span>trucks used</span></div>
                <div><b>{result.requests_scheduled}</b><span>pickups routed</span></div>
                <div><b>{km(result.total_km)}</b><span>total distance</span></div>
                <div><b>{result.km_per_pickup != null ? km(result.km_per_pickup) : '—'}</b><span>per pickup</span></div>
                {result.planner !== 'greedy' && <div><b>{result.clusters}</b><span>communities</span></div>}
                {result.planner !== 'greedy' && <div><b>{result.deferred}</b><span>held (not urgent)</span></div>}
                <div><b>{result.dropped}</b><span>no capacity</span></div>
                <div><b>{result.solve_seconds}s</b><span>solve time</span></div>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
                Distances: {result.distance_source === 'osrm' ? 'OSRM road network' : 'Haversine × road factor'}
              </div>
              {result.notes.map((n) => (
                <div key={n} className="error" style={{ marginTop: 8 }}>{n}</div>
              ))}
            </div>
          )}
          <div className="card card-pad">
            <div className="card-title">
              Active & planned routes <span className="faint">{data?.routes.length ?? 0}</span>
            </div>
            {data && data.routes.length === 0 && <div className="faint">No routes yet. Click “Plan routes now”.</div>}
            <div className="grid" style={{ gap: 10 }}>
              {(data?.routes ?? []).map((r) => {
                const v = vehicleById.get(r.vehicle_id);
                const done = r.stops.filter((s) => s.status !== 'pending').length;
                return (
                  <div key={r.id} className={`card route-item ${selected === r.id ? 'sel' : ''}`} onClick={() => setSelected(selected === r.id ? null : r.id)}>
                    <div className="row between">
                      <b className="row">
                        <span className="swatch" style={{ background: routeColor(r.id), width: 14, height: 4, borderRadius: 2 }} />
                        {v?.name ?? `Vehicle ${r.vehicle_id}`}
                      </b>
                      <Status s={r.status} />
                    </div>
                    <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                      <span className="badge tone-neutral" style={{ marginRight: 6 }}>{r.planner === 'greedy' ? 'baseline' : 'smart'}</span>
                      Route #{r.id} · {v?.driver_name ?? 'no driver'} · {done}/{r.stops.length} stops · {km(r.total_km)}
                    </div>
                    <div className="hbar-track" style={{ marginTop: 8, height: 6 }}>
                      <div className="hbar-fill" style={{ width: `${(done / Math.max(1, r.stops.length)) * 100}%`, background: routeColor(r.id) }} />
                    </div>
                    {r.status === 'planned' && selected === r.id && (
                      <button
                        className="btn small danger"
                        style={{ marginTop: 10 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelRoute(r.id);
                        }}
                      >
                        Cancel route
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card card-pad">
            <div className="card-title">Fleet</div>
            {(data?.vehicles ?? []).map((v) => (
              <div key={v.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <b>{v.name}</b>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {v.reg_no} · {kg(v.capacity_kg)} · {v.allowed_types.split(',').map((t) => WASTE[t]?.label ?? t).join(', ')}
                  </div>
                </div>
                <Status s={v.status} />
              </div>
            ))}
          </div>
          <div className="card card-pad">
            <div className="card-title">Most urgent pending</div>
            {[...pending]
              .sort((a, b) => b.priority_score - a.priority_score)
              .slice(0, 6)
              .map((q) => (
                <div key={q.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="row">
                    <span className="swatch" style={{ background: WASTE[q.waste_type]?.color }} />#{q.id} · {kg(q.est_kg)}
                  </span>
                  <span className="faint" style={{ fontSize: 12 }}>
                    P{q.priority_score.toFixed(1)} · {until(q.sla_deadline)}
                  </span>
                </div>
              ))}
            {pending.length === 0 && <div className="faint">Queue is empty.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
