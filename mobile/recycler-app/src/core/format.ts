export function toDate(iso?: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

export function timeAgo(iso?: string | null): string {
  const d = toDate(iso);
  if (!d) return '—';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function timeUntil(iso?: string | null): string {
  const d = toDate(iso);
  if (!d) return '—';
  const m = Math.round((d.getTime() - Date.now()) / 60000);
  if (m < -60) return `${Math.floor(-m / 60)} h overdue`;
  if (m < 0) return `${-m} min overdue`;
  if (m < 60) return `in ${m} min`;
  if (m < 1440) return `in ${Math.floor(m / 60)} h ${m % 60} min`;
  return `in ${Math.floor(m / 1440)} d`;
}

export function clock(iso?: string | null): string {
  const d = toDate(iso);
  if (!d) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function dateTime(iso?: string | null): string {
  const d = toDate(iso);
  if (!d) return '—';
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${clock(iso)}`;
}

export function kg(n?: number | null): string {
  if (n === null || n === undefined) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(2)} t` : `${Number(n.toFixed(1))} kg`;
}

export function km(n?: number | null): string {
  if (n === null || n === undefined) return '—';
  return n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`;
}

export function inr(n?: number | null): string {
  if (n === null || n === undefined) return '—';
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
