import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { api } from './api';
import { STATUS, WASTE } from './meta';

const ICONS: Record<string, string> = {
  overview: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  map: 'M15 5.1 9 3 3 5v16l6-2.1 6 2.1 6-2V3l-6 2.1zM15 19l-6-2.1V5l6 2.1V19z',
  list: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z',
  route: 'M6 3a3 3 0 0 0-1 5.83V15a5 5 0 0 0 5 5h4.17A3 3 0 1 0 14 18h-4a3 3 0 0 1-3-3V8.83A3 3 0 0 0 6 3zm12 0a3 3 0 0 0-1 5.83V12h2V8.83A3 3 0 0 0 18 3z',
  truck: 'M3 5h11v9H3zm11 3h4l3 3v3h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  users: 'M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-8 1.3-8 4v2h10v-2c0-1 .4-1.9 1.1-2.6A13 13 0 0 0 8 13zm8 0c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z',
  chart: 'M4 20V10h3v10zm6.5 0V4h3v16zM17 20v-7h3v7z',
  play: 'M8 5v14l11-7z',
  refresh: 'M17.6 6.4A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h7V4z',
  plus: 'M11 5h2v14h-2zM5 11h14v2H5z',
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d={ICONS[name] ?? ''} />
    </svg>
  );
}

export function Status({ s }: { s: string }) {
  const m = STATUS[s] ?? { label: s, tone: 'neutral' };
  return <span className={`badge tone-${m.tone}`}>{m.label}</span>;
}

export function Waste({ t }: { t: string }) {
  const w = WASTE[t] ?? WASTE.general;
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="swatch" style={{ background: w.color }} />
      {w.label}
    </span>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="row wrap">{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal">
        <div className="row between" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18 }}>{title}</h2>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Fetch JSON from the API, optionally polling. */
export function useData<T>(path: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api.get<T>(path);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e: any) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    load();
    if (!pollMs) return () => void (alive.current = false);
    const t = setInterval(load, pollMs);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [load, pollMs]);
  return { data, error, loading, reload: load, setData };
}
