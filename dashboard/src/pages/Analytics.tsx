import { useState } from 'react';

import { HBars, StackedDaily } from '../components/Charts';
import { WASTE, WASTE_ORDER, kg, km } from '../meta';
import { Kpi, PageHead, useData } from '../ui';

export default function Analytics() {
  const [days, setDays] = useState(14);
  const { data: an, error } = useData<any>(`/admin/analytics?days=${days}`);
  const totalReq = an ? an.daily_requests.reduce((a: number, d: any) => a + WASTE_ORDER.reduce((s, k) => s + (d[k] ?? 0), 0), 0) : 0;
  const totalKg = an ? Object.values(an.kg_by_type as Record<string, number>).reduce((a, b) => a + b, 0) : 0;
  const segregated = an ? totalKg - (an.kg_by_type.general ?? 0) : 0;

  return (
    <>
      <PageHead title="Analytics" sub="Demand patterns that feed forecasting and fleet planning">
        <div className="chips">
          {[7, 14, 30].map((d) => (
            <button key={d} className={`chip ${days === d ? 'on' : ''}`} onClick={() => setDays(d)}>
              Last {d} days
            </button>
          ))}
        </div>
      </PageHead>
      {error && <div className="error">{error}</div>}
      {an && (
        <>
          <div className="grid kpis">
            <Kpi label="Requests" value={totalReq} sub={`${(totalReq / days).toFixed(1)} per day`} />
            <Kpi label="Collected" value={kg(totalKg)} />
            <Kpi label="Segregation rate" value={totalKg ? `${Math.round((segregated / totalKg) * 100)}%` : '—'} sub="by weight, not mixed" />
            <Kpi label="Avg route" value={an.avg_km_per_route ? km(an.avg_km_per_route) : '—'} sub={an.avg_kg_per_route ? `${kg(an.avg_kg_per_route)} per route` : `${an.completed_routes} completed routes`} />
          </div>
          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div className="card-title">Daily requests by waste type</div>
            <StackedDaily data={an.daily_requests} />
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginTop: 16 }}>
            <div className="card card-pad">
              <div className="card-title">Requests by ward</div>
              <HBars format={(v) => String(v)} items={Object.entries(an.requests_by_ward as Record<string, number>).map(([label, value]) => ({ label, value, color: '#1b7f5a' }))} />
            </div>
            <div className="card card-pad">
              <div className="card-title">Weight collected by type</div>
              <HBars format={kg} items={WASTE_ORDER.map((k) => ({ label: WASTE[k].label, value: an.kg_by_type[k] ?? 0, color: WASTE[k].color }))} />
              <p className="faint" style={{ marginTop: 14 }}>
                Coming next: per-ward demand forecast (time-series) to decide how many trucks to send tomorrow.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
