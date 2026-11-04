import { useState } from 'react';

import { api } from '../api';
import { LineChart } from '../components/Charts';
import { Kpi, PageHead, useData } from '../ui';

const STRAT: Record<string, { label: string; short: string; color: string; note: string }> = {
  fixed: { label: 'Fixed schedule', short: 'Fixed', color: '#d0640f', note: "today's system" },
  greedy: { label: 'Greedy on-demand', short: 'Greedy', color: '#2a78d6', note: 'simple dynamic baseline' },
  smart: { label: 'SmartRoute', short: 'SmartRoute', color: '#1b7f5a', note: 'DBSCAN + CVRP' },
};

interface Metrics {
  strategy: string;
  requests: number;
  collected: number;
  collected_pct: number;
  on_time_pct: number;
  late_hazardous: number;
  avg_wait_h: number;
  total_km: number;
  fuel_l: number;
  co2_kg: number;
  km_per_pickup: number;
  truck_trips: number;
  utilization_pct: number;
  compute_s: number;
}
interface EvalResult {
  scenario: { requests: number; generators: number; seed: number; replan_h: number; by_type: Record<string, number> };
  results: Metrics[];
  smart_vs_fixed: { km_change_pct: number; co2_saved_kg: number; on_time_change_pts: number; wait_change_pct: number };
  assumptions: string[];
}
interface Published {
  generated: string;
  main: EvalResult;
  demand_sweep: Record<string, number>[];
  demand_seeds: number;
  tradeoff: {
    fixed: { total_km: number; on_time_pct: number; avg_wait_h: number };
    smart: { replan_h: number; total_km: number; on_time_pct: number; avg_wait_h: number; truck_trips: number; late_hazardous: number }[];
  };
}

// rows of the comparison table: label, key, format, which direction is better
const ROWS: [string, keyof Metrics, (v: number) => string, 'low' | 'high'][] = [
  ['Collected the same day', 'collected_pct', (v) => `${v}%`, 'high'],
  ['Collected on time (SLA)', 'on_time_pct', (v) => `${v}%`, 'high'],
  ['Hazardous late / missed', 'late_hazardous', (v) => String(v), 'low'],
  ['Average wait', 'avg_wait_h', (v) => `${v} h`, 'low'],
  ['Total distance', 'total_km', (v) => `${v} km`, 'low'],
  ['Diesel', 'fuel_l', (v) => `${v} L`, 'low'],
  ['CO₂ emitted', 'co2_kg', (v) => `${v} kg`, 'low'],
  ['Distance per pickup', 'km_per_pickup', (v) => `${v} km`, 'low'],
  ['Truck trips', 'truck_trips', (v) => String(v), 'low'],
  ['Truck capacity used', 'utilization_pct', (v) => `${v}%`, 'high'],
];

function toCsv(res: EvalResult) {
  const keys = Object.keys(res.results[0]).filter((k) => k !== 'timeline');
  return [keys.join(','), ...res.results.map((m) => keys.map((k) => (m as any)[k]).join(','))].join('\n');
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Evaluation() {
  const { data: pub, error } = useData<Published>('/admin/evaluation');
  const [live, setLive] = useState<EvalResult | null>(null);
  const [form, setForm] = useState({ requests: 120, seed: 7, replan_h: 4 });
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);

  const res = live ?? pub?.main ?? null;
  const by = Object.fromEntries((res?.results ?? []).map((m) => [m.strategy, m])) as Record<string, Metrics>;

  const run = async () => {
    setRunning(true);
    setRunErr(null);
    try {
      const q = new URLSearchParams({ requests: String(form.requests), seed: String(form.seed), replan_h: String(form.replan_h) });
      setLive(await api.post<EvalResult>(`/admin/evaluate?${q}`));
    } catch (e: any) {
      setRunErr(e.message);
    } finally {
      setRunning(false);
    }
  };

  const sweep = pub?.demand_sweep ?? [];
  const xs = sweep.map((r) => r.requests);

  return (
    <>
      <PageHead title="Evaluation" sub="Today's fixed-schedule collection vs SmartRoute: same requests, same 4 trucks, same depot">
        {res && (
          <button className="btn" onClick={() => download(`smartroute_evaluation_${res.scenario.requests}req_seed${res.scenario.seed}.csv`, toCsv(res))}>
            Download CSV
          </button>
        )}
      </PageHead>
      {error && <div className="error">{error}</div>}

      {res && by.smart && by.fixed && (
        <>
          <div className="row between wrap" style={{ marginBottom: 10 }}>
            <div className="muted">
              {live ? 'Live run' : 'Published study'} · {res.scenario.requests} requests in one day · scenario #{res.scenario.seed} · SmartRoute re-plans every{' '}
              {res.scenario.replan_h} h
            </div>
            {live && (
              <button className="btn small" onClick={() => setLive(null)}>
                Back to published study
              </button>
            )}
          </div>
          <div className="grid kpis">
            <Kpi label="Collected on time" value={`${by.smart.on_time_pct}%`} sub={`vs ${by.fixed.on_time_pct}% fixed (${fmtSigned(res.smart_vs_fixed.on_time_change_pts)} pts)`} />
            <Kpi label="Collected same day" value={`${by.smart.collected_pct}%`} sub={`vs ${by.fixed.collected_pct}% fixed`} />
            <Kpi label="Distance driven" value={`${by.smart.total_km} km`} sub={`vs ${by.fixed.total_km} km fixed (${fmtSigned(res.smart_vs_fixed.km_change_pct)}%)`} />
            <Kpi label="CO₂ per day" value={`${by.smart.co2_kg} kg`} sub={res.smart_vs_fixed.co2_saved_kg >= 0 ? `${res.smart_vs_fixed.co2_saved_kg} kg less than fixed` : `${-res.smart_vs_fixed.co2_saved_kg} kg more than fixed`} />
            <Kpi label="Hazardous late" value={by.smart.late_hazardous} sub={`vs ${by.fixed.late_hazardous} with fixed schedule`} />
          </div>

          <div className="card table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Measure</th>
                  {['fixed', 'greedy', 'smart'].map((k) => (
                    <th key={k} className="num">
                      <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        <span className="swatch" style={{ background: STRAT[k].color }} />
                        {STRAT[k].label}
                      </span>
                      <div style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{STRAT[k].note}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, key, fmt, better]) => {
                  const vals = ['fixed', 'greedy', 'smart'].map((k) => by[k]?.[key] as number);
                  const best = better === 'low' ? Math.min(...vals) : Math.max(...vals);
                  return (
                    <tr key={key}>
                      <td>{label}</td>
                      {vals.map((v, i) => (
                        <td key={i} className="num" style={v === best ? { fontWeight: 800, color: 'var(--brand-ink)' } : undefined}>
                          {fmt(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pub && (
        <>
          <div className="grid two-even" style={{ marginTop: 16 }}>
            <div className="card card-pad">
              <div className="card-title">Distance vs daily demand</div>
              <LineChart
                x={xs}
                xLabel="requests per day"
                yLabel="km driven"
                format={(v) => `${Math.round(v)} km`}
                series={['fixed', 'greedy', 'smart'].map((k) => ({ name: STRAT[k].short, color: STRAT[k].color, values: sweep.map((r) => r[`${k}_total_km`]) }))}
              />
            </div>
            <div className="card card-pad">
              <div className="card-title">On-time collection vs daily demand</div>
              <LineChart
                x={xs}
                xLabel="requests per day"
                yLabel="% collected on time"
                yMin={60}
                yMax={100}
                format={(v) => `${Math.round(v)}%`}
                series={['fixed', 'greedy', 'smart'].map((k) => ({ name: STRAT[k].short, color: STRAT[k].color, values: sweep.map((r) => r[`${k}_on_time_pct`]) }))}
              />
            </div>
          </div>
          <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>
            Each point is the average of {pub.demand_seeds} random scenarios. SmartRoute re-plans every 4 h.
          </p>

          <div className="grid two-even" style={{ marginTop: 10 }}>
            <div className="card table-wrap">
              <div className="card-pad" style={{ paddingBottom: 0 }}>
                <div className="card-title">Re-planning interval trade-off (120 requests)</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>SmartRoute re-plans every</th>
                    <th className="num">Distance</th>
                    <th className="num">On time</th>
                    <th className="num">Avg wait</th>
                    <th className="num">Trips</th>
                  </tr>
                </thead>
                <tbody>
                  {pub.tradeoff.smart.map((r) => (
                    <tr key={r.replan_h} style={r.replan_h === 4 ? { background: 'var(--brand-soft)' } : undefined}>
                      <td>
                        {r.replan_h} h{r.replan_h === 4 ? ' (default)' : ''}
                      </td>
                      <td className="num">{r.total_km} km</td>
                      <td className="num">{r.on_time_pct}%</td>
                      <td className="num">{r.avg_wait_h} h</td>
                      <td className="num">{r.truck_trips}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="muted">Fixed schedule (reference)</td>
                    <td className="num muted">{pub.tradeoff.fixed.total_km} km</td>
                    <td className="num muted">{pub.tradeoff.fixed.on_time_pct}%</td>
                    <td className="num muted">{pub.tradeoff.fixed.avg_wait_h} h</td>
                    <td className="num muted">7</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="card card-pad">
              <div className="card-title">What the results show</div>
              <Findings pub={pub} />
            </div>
          </div>
        </>
      )}

      <div className="grid two-even" style={{ marginTop: 16 }}>
        <div className="card card-pad">
          <div className="card-title">Run a live simulation</div>
          <div className="form-grid">
            <label className="field">
              Requests in the day (20–250)
              <input className="input" type="number" min={20} max={250} value={form.requests} onChange={(e) => setForm({ ...form, requests: Number(e.target.value) })} />
            </label>
            <label className="field">
              Scenario number (any)
              <input className="input" type="number" min={1} value={form.seed} onChange={(e) => setForm({ ...form, seed: Number(e.target.value) })} />
            </label>
            <label className="field full">
              SmartRoute re-plans every
              <select className="input" value={form.replan_h} onChange={(e) => setForm({ ...form, replan_h: Number(e.target.value) })}>
                {[2, 3, 4, 6].map((h) => (
                  <option key={h} value={h}>
                    {h} hours
                  </option>
                ))}
              </select>
            </label>
          </div>
          {runErr && <div className="error" style={{ marginTop: 10 }}>{runErr}</div>}
          <button className="btn primary" style={{ marginTop: 14 }} onClick={run} disabled={running}>
            {running ? 'Simulating a full day… (up to a minute)' : 'Run simulation'}
          </button>
        </div>
        <div className="card card-pad">
          <div className="card-title">How the simulation works</div>
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {(res?.assumptions ?? []).map((a) => (
              <li key={a}>{a}</li>
            ))}
            <li>300 registered households and businesses across 10 Vellore wards; requests arrive 06:00–19:00 with a morning peak.</li>
          </ul>
        </div>
      </div>
    </>
  );
}

function fmtSigned(v: number | null | undefined) {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v}`;
}

function Findings({ pub }: { pub: Published }) {
  const s = pub.demand_sweep;
  const cross = s.find((r) => r.smart_total_km > r.fixed_total_km);
  const low = s[0];
  const saveLow = Math.round((100 * (low.fixed_total_km - low.smart_total_km)) / low.fixed_total_km);
  const minOn = Math.min(...s.map((r) => r.smart_on_time_pct));
  const maxFixedOn = Math.max(...s.map((r) => r.fixed_on_time_pct));
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
      <li>
        <b>Service:</b> SmartRoute collects at least {minOn}% of requests on time at every demand level; the fixed schedule never exceeds {maxFixedOn}%, because
        requests raised after the 14:00 run wait until the next morning.
      </li>
      <li>
        <b>Fuel:</b> at {low.requests} requests/day SmartRoute drives {saveLow}% fewer km than the fixed schedule.
        {cross
          ? ` From about ${cross.requests} requests/day the door-to-door sweep becomes cheaper in km, since most houses then have waste anyway.`
          : ' It stays cheaper at every demand level tested.'}
      </li>
      <li>
        <b>Greedy is not enough:</b> on-demand routing without clustering and optimisation drives the most km of all three, so the savings come from DBSCAN +
        CVRP, not just from being on-demand.
      </li>
      <li>
        <b>Recommendation:</b> use SmartRoute for low and medium-density areas and for urgent waste everywhere; keep a fixed sweep only for very dense market
        zones at peak hours.
      </li>
    </ul>
  );
}
