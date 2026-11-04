import { getLang, t } from './i18n';

export function toDate(iso?: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

export function timeAgo(iso?: string | null): string {
  const d = toDate(iso);
  if (!d) return '—';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return t('time.justNow');
  if (s < 3600) return t('time.minAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('time.hAgo', { n: Math.floor(s / 3600) });
  return t('time.dAgo', { n: Math.floor(s / 86400) });
}

export function timeUntil(iso?: string | null): string {
  const d = toDate(iso);
  if (!d) return '—';
  const m = Math.round((d.getTime() - Date.now()) / 60000);
  if (m < -60) return t('time.hLate', { n: Math.floor(-m / 60) });
  if (m < 0) return t('time.minLate', { n: -m });
  if (m < 60) return t('time.inMin', { n: m });
  if (m < 1440) return t('time.inHM', { h: Math.floor(m / 60), m: m % 60 });
  return t('time.inD', { n: Math.floor(m / 1440) });
}

export function clock(iso?: string | null): string {
  const d = toDate(iso);
  if (!d) return '—';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function dateTime(iso?: string | null): string {
  const d = toDate(iso);
  if (!d) return '—';
  return `${d.toLocaleDateString(getLang() === 'ta' ? 'ta-IN' : 'en-IN', { day: 'numeric', month: 'short' })}, ${clock(iso)}`;
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
