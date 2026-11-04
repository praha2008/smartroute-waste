import { HBars, StackedDaily } from '../components/Charts';
import { STATUS, WASTE, WASTE_ORDER, kg, km } from '../meta';
import { Icon, Kpi, PageHead, useData } from '../ui';

export interface OverviewData {
  requests_total: number;
  status_counts: Record<string, number>;
  open_requests: number;
  overdue_open: number;
  collected_today: number;
  kg_collected_total: number;
  kg_collected_today: number;
  sla_compliance_pct: number | null;
  vehicles_total: number;
  vehicles_on_route: number;
  routes_today: number;
  km_planned_today: number;
  utilization_pct_today: number | null;
  citizens: number;
  recyclable_lots_available: number;
}

export default function Overview() {
  const { data: o, error } = useData<OverviewData>('/admin/overview', 15000);
  const { data: an } = useData<any>('/admin/analytics?days=14', 60000);

  return (
    <>
      <PageHead title="Overview" sub="Vellore Municipal Corporation · live operations">
        <button className="btn primary" onClick={() => (window.location.hash = '#/live')}>
          <Icon name="map" /> Open live map & plan routes
        </button>
      </PageHead>
      {error && <div className="error">{error}</div>}
      {o && (
        <div className="grid kpis">
          <Kpi label="Open requests" value={o.open_requests} sub={o.overdue_open ? <span style={{ color: 'var(--bad)' }}>{o.overdue_open} past SLA deadline</span> : 'none overdue'} />
          <Kpi label="Collected today" value={o.collected_today} sub={`${kg(o.kg_collected_today)} weighed`} />
          <Kpi label="SLA compliance" value={o.sla_compliance_pct != null ? `${o.sla_compliance_pct}%` : '—'} sub="collected before deadline" />
          <Kpi label="Fleet on route" value={`${o.vehicles_on_route}/${o.vehicles_total}`} sub={`${o.routes_today} routes today · ${km(o.km_planned_today)}`} />
          <Kpi label="Truck utilization" value={o.utilization_pct_today != null ? `${o.utilization_pct_today}%` : '—'} sub="planned load ÷ capacity, today" />
          <Kpi label="Total collected" value={kg(o.kg_collected_total)} sub={`${o.citizens} registered generators`} />
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', marginTop: 16 }}>
        <div className="card card-pad">
          <div className="card-title">Requests per day · last 14 days</div>
          {an ? <StackedDaily data={an.daily_requests} /> : <div className="faint">Loading…</div>}
        </div>
        <div className="card card-pad">
          <div className="card-title">Waste collected by type</div>
          {an && (
            <HBars
              format={kg}
              items={WASTE_ORDER.map((k) => ({ label: WASTE[k].label, value: an.kg_by_type[k] ?? 0, color: WASTE[k].color }))}
            />
          )}
          <div className="card-title" style={{ marginTop: 22 }}>
            Request pipeline
          </div>
          {o && (
            <HBars
              format={(v) => String(v)}
              items={['pending', 'scheduled', 'in_progress', 'collected', 'cancelled'].map((s) => ({ label: STATUS[s].label, value: o.status_counts[s] ?? 0, color: '#5f6b66' }))}
            />
          )}
        </div>
      </div>
    </>
  );
}
