/** Waste-type colours are a validated categorical palette (CVD-safe, checked
 * with the dataviz validator) and are used consistently on map, tables and charts. */
export const WASTE: Record<string, { label: string; color: string; soft: string }> = {
  organic: { label: 'Organic', color: '#1f9a4b', soft: '#e3f4e9' },
  recyclable: { label: 'Recyclable', color: '#2a78d6', soft: '#e4eefb' },
  general: { label: 'Mixed', color: '#a0712b', soft: '#f5ecdf' },
  e_waste: { label: 'E-waste', color: '#7c5ce0', soft: '#eeeafb' },
  hazardous: { label: 'Hazardous', color: '#d8433b', soft: '#fbe7e5' },
};
export const WASTE_ORDER = ['organic', 'recyclable', 'general', 'e_waste', 'hazardous'];

export const STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'warn' | 'good' | 'bad' | 'active' }> = {
  pending: { label: 'Pending', tone: 'warn' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'active' },
  collected: { label: 'Collected', tone: 'good' },
  missed: { label: 'Missed', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  planned: { label: 'Planned', tone: 'info' },
  active: { label: 'Active', tone: 'active' },
  completed: { label: 'Completed', tone: 'good' },
  idle: { label: 'Idle', tone: 'neutral' },
  on_route: { label: 'On route', tone: 'active' },
  offline: { label: 'Offline', tone: 'bad' },
  done: { label: 'Done', tone: 'good' },
  skipped: { label: 'Skipped', tone: 'bad' },
};

export const URGENCY: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

export const kg = (n?: number | null) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(2)} t` : `${Number(n.toFixed(1))} kg`);
export const km = (n?: number | null) => (n == null ? '—' : `${n.toFixed(1)} km`);
export const dt = (s?: string | null) =>
  s ? new Date(s).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export function until(s?: string | null) {
  if (!s) return '—';
  const m = Math.round((new Date(s).getTime() - Date.now()) / 60000);
  if (m < 0) return m > -60 ? `${-m}m late` : `${Math.floor(-m / 60)}h late`;
  return m < 60 ? `${m}m left` : m < 1440 ? `${Math.floor(m / 60)}h left` : `${Math.floor(m / 1440)}d left`;
}
