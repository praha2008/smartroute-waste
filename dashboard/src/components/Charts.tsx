import { useState } from 'react';

import { WASTE, WASTE_ORDER } from '../meta';

interface Tip {
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: string; color?: string }[];
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{tip.title}</div>
      {tip.rows.map((r) => (
        <div className="t-row" key={r.label}>
          <span className="row" style={{ gap: 6 }}>
            {r.color && <span className="swatch" style={{ background: r.color }} />}
            {r.label}
          </span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

/** Stacked daily bars of request counts by waste type. */
export function StackedDaily({ data }: { data: Array<Record<string, any>> }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 720;
  const H = 240;
  const pad = { l: 34, r: 8, t: 10, b: 26 };
  const totals = data.map((d) => WASTE_ORDER.reduce((a, k) => a + (d[k] ?? 0), 0));
  const max = Math.max(4, ...totals);
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const GAP = 2;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" onMouseLeave={() => setTip(null)} role="img" aria-label="Requests per day by waste type">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(i * step)} y2={y(i * step)} stroke="#e8ecea" />
            <text x={pad.l - 6} y={y(i * step) + 4} fontSize="10" textAnchor="end" fill="#85918b">
              {i * step}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          let acc = 0;
          const x = pad.l + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const present = WASTE_ORDER.filter((k) => (d[k] ?? 0) > 0);
          return (
            <g key={d.date}>
              {present.map((k, j) => {
                const v = d[k];
                const y1 = y(acc + v);
                const h = Math.max(1, y(acc) - y1 - (j > 0 ? GAP : 0));
                acc += v;
                const isTop = j === present.length - 1;
                return (
                  <path
                    key={k}
                    fill={WASTE[k].color}
                    d={
                      isTop
                        ? `M${x},${y1 + h} V${y1 + 4} Q${x},${y1} ${x + 4},${y1} H${x + w - 4} Q${x + w},${y1} ${x + w},${y1 + 4} V${y1 + h} Z`
                        : `M${x},${y1} H${x + w} V${y1 + h} H${x} Z`
                    }
                  />
                );
              })}
              <rect
                x={pad.l + i * bw}
                y={pad.t}
                width={bw}
                height={H - pad.t - pad.b}
                fill="transparent"
                onMouseMove={(e) =>
                  setTip({
                    x: e.clientX,
                    y: e.clientY,
                    title: `${new Date(d.date).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · ${totals[i]} requests`,
                    rows: WASTE_ORDER.filter((k) => d[k]).map((k) => ({ label: WASTE[k].label, value: String(d[k]), color: WASTE[k].color })),
                  })
                }
              />
              {(i % 2 === 0 || data.length <= 8) && (
                <text x={pad.l + i * bw + bw / 2} y={H - 8} fontSize="10" textAnchor="middle" fill="#85918b">
                  {new Date(d.date).getDate()}/{new Date(d.date).getMonth() + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {WASTE_ORDER.map((k) => (
          <span key={k}>
            <i className="swatch" style={{ background: WASTE[k].color }} />
            {WASTE[k].label}
          </span>
        ))}
      </div>
      <Tooltip tip={tip} />
    </>
  );
}

/** Simple horizontal bars (label · bar · value). */
export function HBars({ items, format }: { items: { label: string; value: number; color?: string }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div>
      {items.map((it) => (
        <div className="hbar" key={it.label} title={`${it.label}: ${format(it.value)}`}>
          <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {it.label}
          </span>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? '#1b7f5a' }} />
          </div>
          <b style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{format(it.value)}</b>
        </div>
      ))}
    </div>
  );
}

export interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

/** Multi-series line chart over numeric x values, with crosshair tooltip and end-of-line labels. */
export function LineChart({
  x,
  series,
  xLabel,
  yLabel,
  format,
  yMin,
  yMax,
}: {
  x: number[];
  series: LineSeries[];
  xLabel: string;
  yLabel: string;
  format: (v: number) => string;
  yMin?: number;
  yMax?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 560;
  const H = 260;
  const pad = { l: 46, r: 92, t: 12, b: 40 };
  const all = series.flatMap((s) => s.values);
  const lo = yMin ?? Math.min(0, ...all);
  const rawHi = yMax ?? Math.max(...all);
  const step = niceStep((rawHi - lo) / 4);
  const hi = yMax ?? Math.ceil(rawHi / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  const X = (v: number) => pad.l + ((v - x[0]) / (x[x.length - 1] - x[0] || 1)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);

  // spread end labels so they don't collide
  const ends = series
    .map((s) => ({ s, y: Y(s.values[s.values.length - 1]) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label={`${yLabel} by ${xLabel}`}
        onMouseLeave={() => {
          setHover(null);
          setTip(null);
        }}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          let best = 0;
          x.forEach((v, i) => {
            if (Math.abs(X(v) - px) < Math.abs(X(x[best]) - px)) best = i;
          });
          setHover(best);
          setTip({ x: e.clientX, y: e.clientY, title: `${x[best]} ${xLabel}`, rows: series.map((s) => ({ label: s.name, value: format(s.values[best]), color: s.color })) });
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="#e8ecea" />
            <text x={pad.l - 6} y={Y(t) + 4} fontSize="10" textAnchor="end" fill="#85918b">
              {format(t)}
            </text>
          </g>
        ))}
        {x.map((v) => (
          <text key={v} x={X(v)} y={H - pad.b + 16} fontSize="10" textAnchor="middle" fill="#85918b">
            {v}
          </text>
        ))}
        <text x={(pad.l + W - pad.r) / 2} y={H - 6} fontSize="11" textAnchor="middle" fill="#4d5b55">
          {xLabel}
        </text>
        {hover !== null && <line x1={X(x[hover])} x2={X(x[hover])} y1={pad.t} y2={H - pad.b} stroke="#c9d1cd" strokeDasharray="3 3" />}
        {series.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={s.values.map((v, i) => `${X(x[i])},${Y(v)}`).join(' ')} />
            {s.values.map((v, i) => (
              <circle key={i} cx={X(x[i])} cy={Y(v)} r={hover === i ? 5 : 3.5} fill={s.color} stroke="#fff" strokeWidth="2" />
            ))}
          </g>
        ))}
        {ends.map(({ s, y }) => (
          <text key={s.name} x={W - pad.r + 8} y={y + 4} fontSize="11" fontWeight="600" fill="#4d5b55">
            {s.name}
          </text>
        ))}
      </svg>
      <div className="legend">
        {series.map((s) => (
          <span key={s.name}>
            <i className="swatch" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <Tooltip tip={tip} />
    </>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** History (solid line) + forecast (points with 80% range whiskers), festival labels, hover. */
export function ForecastChart({
  history,
  forecast,
}: {
  history: { date: string; count: number }[];
  forecast: { date: string; count: number; lo: number; hi: number; festival: string | null; is_today: boolean }[];
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 760;
  const H = 280;
  const pad = { l: 40, r: 14, t: 26, b: 34 };
  const n = history.length + forecast.length;
  const maxV = Math.max(...history.map((h) => h.count), ...forecast.map((f) => f.hi), 10);
  const step = maxV > 80 ? 20 : maxV > 40 ? 10 : 5;
  const top = Math.ceil(maxV / step) * step;
  const X = (i: number) => pad.l + ((i + 0.5) / n) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const fi = (k: number) => history.length + k;
  const label = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' });
  const HIST = '#5f6b66';
  const FC = '#1b7f5a';
  const ticks = Array.from({ length: top / step + 1 }, (_, k) => k * step);

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label="Requests per day: recent history and forecast"
        onMouseLeave={() => {
          setTip(null);
          setHover(null);
        }}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * n - 0.5)));
          setHover(i);
          if (i < history.length) {
            const h = history[i];
            setTip({ x: e.clientX, y: e.clientY, title: label(h.date), rows: [{ label: 'Actual requests', value: String(h.count), color: HIST }] });
          } else {
            const f = forecast[i - history.length];
            setTip({
              x: e.clientX,
              y: e.clientY,
              title: `${label(f.date)}${f.is_today ? ' (today)' : ''}${f.festival ? ` · ${f.festival}` : ''}`,
              rows: [
                { label: 'Forecast', value: f.count.toFixed(0), color: FC },
                { label: '80% range', value: `${f.lo.toFixed(0)}–${f.hi.toFixed(0)}` },
              ],
            });
          }
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="#e8ecea" />
            <text x={pad.l - 6} y={Y(t) + 4} fontSize="10" textAnchor="end" fill="#85918b">
              {t}
            </text>
          </g>
        ))}
        {/* forecast zone */}
        <rect x={X(fi(0)) - (W - pad.l - pad.r) / n / 2} y={pad.t} width={X(n - 1) - X(fi(0)) + (W - pad.l - pad.r) / n} height={H - pad.t - pad.b} fill="#e3f2eb" opacity="0.55" />
        <text x={X(fi(0)) - (W - pad.l - pad.r) / n / 2 + 6} y={pad.t - 8} fontSize="11" fill="#0f5a3e" fontWeight="600">
          Forecast →
        </text>
        {hover !== null && <line x1={X(hover)} x2={X(hover)} y1={pad.t} y2={H - pad.b} stroke="#c9d1cd" strokeDasharray="3 3" />}
        <polyline fill="none" stroke={HIST} strokeWidth="2" points={history.map((h, i) => `${X(i)},${Y(h.count)}`).join(' ')} />
        <polyline
          fill="none"
          stroke={FC}
          strokeWidth="2"
          strokeDasharray="5 4"
          points={[`${X(history.length - 1)},${Y(history[history.length - 1]?.count ?? 0)}`, ...forecast.map((f, k) => `${X(fi(k))},${Y(f.count)}`)].join(' ')}
        />
        {forecast.map((f, k) => (
          <g key={f.date}>
            <line x1={X(fi(k))} x2={X(fi(k))} y1={Y(f.lo)} y2={Y(f.hi)} stroke={FC} strokeWidth="1.5" />
            <line x1={X(fi(k)) - 4} x2={X(fi(k)) + 4} y1={Y(f.lo)} y2={Y(f.lo)} stroke={FC} strokeWidth="1.5" />
            <line x1={X(fi(k)) - 4} x2={X(fi(k)) + 4} y1={Y(f.hi)} y2={Y(f.hi)} stroke={FC} strokeWidth="1.5" />
            <circle cx={X(fi(k))} cy={Y(f.count)} r={hover === fi(k) ? 5.5 : 4} fill={FC} stroke="#fff" strokeWidth="2" />
            {f.festival && (
              <text x={X(fi(k))} y={Y(f.hi) - 8} fontSize="10.5" fontWeight="700" textAnchor="middle" fill="#0f5a3e">
                {f.festival}
              </text>
            )}
          </g>
        ))}
        {[...history.map((h) => h.date), ...forecast.map((f) => f.date)].map((d, i) =>
          (n - 1 - i) % 4 === 0 ? (
            <text key={d} x={X(i)} y={H - 12} fontSize="10" textAnchor="middle" fill="#85918b">
              {label(d)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="legend">
        <span>
          <i className="swatch" style={{ background: HIST, height: 3 }} />
          Actual requests per day
        </span>
        <span>
          <i className="swatch" style={{ background: FC }} />
          Forecast with 80% range
        </span>
      </div>
      <Tooltip tip={tip} />
    </>
  );
}
