import { ForecastChart, HBars } from '../components/Charts';
import { WASTE, WASTE_ORDER, kg } from '../meta';
import { Kpi, PageHead, Waste, useData } from '../ui';

interface FC {
  source: 'database' | 'simulated';
  history_days: number;
  history_start: string;
  history_end: string;
  today: string;
  accuracy: { model: string; label: string; mae: number; wape: number; city_wape: number }[];
  best_model: string;
  used_model: string;
  tomorrow: { date: string; count: number; kg: number; by_type: Record<string, { count: number; kg: number }> };
  city_history: { date: string; count: number }[];
  city_forecast: { date: string; count: number; lo: number; hi: number; festival: string | null; is_today: boolean }[];
  wards: {
    ward: string;
    profile: string;
    tomorrow: number;
    last7_avg: number;
    change_pct: number | null;
    next7_total: number;
    top_type: string;
  }[];
  fleet: { general_trucks: number; hazmat_van: boolean; total_trucks: number; reason: string[] };
  regulars: { user_id: number; name: string; ward: string; every_days: number; last: string; expected: string; usual_type: string; avg_kg: number }[];
  festivals_ahead: { date: string; festival: string; count: number }[];
  factors: { day_of_week: Record<string, number>; festival: number; after_festival: number; festival_learned: boolean };
}

const day = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

export default function Forecast() {
  const { data: f, error, loading } = useData<FC>('/admin/forecast');

  return (
    <>
      <PageHead
        title="Demand forecast"
        sub="Expected pickup requests per ward for today and the next 7 days, and the fleet to send tomorrow"
      />
      {error && <div className="error">{error}</div>}
      {loading && !f && <div className="card card-pad faint">Training the forecast on the request history…</div>}
      {f && (
        <>
          <div className={f.source === 'simulated' ? 'notice' : 'card card-pad'} style={{ marginBottom: 14, padding: '10px 14px' }}>
            {f.source === 'simulated' ? (
              <>
                <b>Simulated history.</b> This system has less than 4 weeks of real requests, so the forecast is trained on a simulated 120-day Vellore
                history (weekly pattern, growing adoption, festival spikes). It switches to real data automatically after 28 days.
              </>
            ) : (
              <>
                Trained on <b>{f.history_days} days of real requests</b> ({day(f.history_start)} – {day(f.history_end)}).
              </>
            )}
          </div>

          <div className="grid kpis">
            <Kpi label={`Tomorrow · ${day(f.tomorrow.date)}`} value={`${f.tomorrow.count.toFixed(0)} requests`} sub={`≈ ${kg(f.tomorrow.kg)} of waste`} />
            <Kpi
              label="Trucks to send tomorrow"
              value={f.fleet.total_trucks}
              sub={`${f.fleet.general_trucks} collection truck${f.fleet.general_trucks > 1 ? 's' : ''}${f.fleet.hazmat_van ? ' + hazmat van' : ''}`}
            />
            <Kpi label="Busiest ward tomorrow" value={f.wards[0]?.ward ?? '—'} sub={`${f.wards[0]?.tomorrow.toFixed(1)} requests expected`} />
            <Kpi
              label="Festival ahead"
              value={f.festivals_ahead[0]?.festival ?? 'None'}
              sub={f.festivals_ahead[0] ? `${day(f.festivals_ahead[0].date)} · ${f.festivals_ahead[0].count.toFixed(0)} requests expected` : 'in the next 7 days'}
            />
          </div>

          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div className="card-title">Requests per day across Vellore</div>
            <ForecastChart history={f.city_history} forecast={f.city_forecast} />
          </div>

          <div className="grid two-col" style={{ marginTop: 16 }}>
            <div className="card table-wrap">
              <div className="card-pad" style={{ paddingBottom: 0 }}>
                <div className="card-title">Tomorrow by ward</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Ward</th>
                    <th className="num">Tomorrow</th>
                    <th className="num">vs last 7 days</th>
                    <th className="num">Next 7 days</th>
                    <th>Main waste</th>
                  </tr>
                </thead>
                <tbody>
                  {f.wards.map((w) => (
                    <tr key={w.ward}>
                      <td>
                        <b>{w.ward}</b>
                        <div className="faint" style={{ fontSize: 12 }}>
                          {w.profile}
                        </div>
                      </td>
                      <td className="num">{w.tomorrow.toFixed(1)}</td>
                      <td className="num" style={{ color: (w.change_pct ?? 0) > 15 ? 'var(--warn)' : undefined }}>
                        {w.change_pct == null ? '—' : `${w.change_pct > 0 ? '+' : ''}${w.change_pct}%`}
                      </td>
                      <td className="num">{w.next7_total}</td>
                      <td>
                        <Waste t={w.top_type} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
              <div className="card card-pad">
                <div className="card-title">Fleet suggestion for tomorrow</div>
                <ul className="muted" style={{ margin: '0 0 14px', paddingLeft: 18, display: 'grid', gap: 6 }}>
                  {f.fleet.reason.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <HBars format={kg} items={WASTE_ORDER.map((t) => ({ label: WASTE[t].label, value: f.tomorrow.by_type[t]?.kg ?? 0, color: WASTE[t].color }))} />
              </div>
              <div className="card card-pad">
                <div className="card-title">Learned patterns</div>
                <HBars
                  format={(v) => `×${v.toFixed(2)}`}
                  items={Object.entries(f.factors.day_of_week).map(([d, v]) => ({ label: d, value: v, color: '#5f6b66' }))}
                />
                <p className="faint" style={{ fontSize: 12, margin: '8px 0 0' }}>
                  Festival days ×{f.factors.festival}, day after ×{f.factors.after_festival}
                  {f.factors.festival_learned ? ' (learned from history, blended with a +50% prior)' : ' (prior: no festival in history yet)'}.
                </p>
              </div>
            </div>
          </div>

          <div className="grid two-even" style={{ marginTop: 16 }}>
            <div className="card table-wrap">
              <div className="card-pad" style={{ paddingBottom: 0 }}>
                <div className="card-title">Forecast accuracy · last 14 days, one day ahead</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Method</th>
                    <th className="num">Avg error / ward-day</th>
                    <th className="num">Ward error %</th>
                    <th className="num">City error %</th>
                  </tr>
                </thead>
                <tbody>
                  {f.accuracy.map((a) => (
                    <tr key={a.model} style={a.model === f.used_model ? { background: 'var(--brand-soft)' } : undefined}>
                      <td>
                        {a.label}
                        {a.model === f.used_model && <span className="badge tone-good" style={{ marginLeft: 6 }}>used</span>}
                      </td>
                      <td className="num">{a.mae.toFixed(2)}</td>
                      <td className="num">{a.wape}%</td>
                      <td className="num">{a.city_wape}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="faint" style={{ fontSize: 12, padding: '0 14px 12px', margin: 0 }}>
                Error % = WAPE (total absolute error ÷ total requests). The method with the lowest ward error on this data is used automatically. Wards see only
                a few requests a day, so day-to-day noise limits ward accuracy; the city total is much more predictable.
              </p>
            </div>
            <div className="card table-wrap">
              <div className="card-pad" style={{ paddingBottom: 0 }}>
                <div className="card-title">Regular generators likely to request tomorrow</div>
              </div>
              {f.regulars.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Generator</th>
                      <th className="num">Requests every</th>
                      <th>Usually</th>
                      <th>Expected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.regulars.map((r) => (
                      <tr key={r.user_id}>
                        <td>
                          <b>{r.name}</b>
                          <div className="faint" style={{ fontSize: 12 }}>
                            {r.ward}
                          </div>
                        </td>
                        <td className="num">{r.every_days} days</td>
                        <td>
                          <Waste t={r.usual_type} /> <span className="faint">~{kg(r.avg_kg)}</span>
                        </td>
                        <td>{day(r.expected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="faint" style={{ padding: '0 16px 16px', margin: 0 }}>
                  {f.source === 'simulated'
                    ? 'Needs real history: once households and businesses have made 4 or more requests, their usual interval is learned and they appear here.'
                    : 'No regular generator is due tomorrow.'}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
