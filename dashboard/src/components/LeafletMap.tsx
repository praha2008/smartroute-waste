import * as L from 'leaflet';
import { useEffect, useRef } from 'react';

export interface MarkerSpec {
  id: string;
  lat: number;
  lng: number;
  html: string; // inner HTML of the marker
  size: [number, number];
  popup?: string;
  z?: number;
  onClick?: () => void;
}
export interface LineSpec {
  id: string;
  points: [number, number][];
  color: string;
  weight?: number;
  opacity?: number;
  dashed?: boolean;
}

export interface PolySpec {
  id: string;
  points: [number, number][];
  color: string;
  label?: string;
}

interface Props {
  markers: MarkerSpec[];
  lines: LineSpec[];
  polygons?: PolySpec[];
  center?: [number, number];
  fitKey?: string; // change this to re-fit bounds
}

export default function LeafletMap({ markers, lines, polygons = [], center = [12.9165, 79.1325], fitKey }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const lastFit = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView(center, 13);
    // Free OpenStreetMap tiles (no API key)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds: [number, number][] = [];
    for (const pg of polygons) {
      const poly = L.polygon(pg.points, { color: pg.color, weight: 1.5, opacity: 0.7, fillColor: pg.color, fillOpacity: 0.08, dashArray: '4 4' }).addTo(g);
      if (pg.label) poly.bindTooltip(pg.label, { sticky: true });
    }
    for (const l of lines) {
      if (l.points.length < 2) continue;
      L.polyline(l.points, { color: l.color, weight: l.weight ?? 4, opacity: l.opacity ?? 0.85, dashArray: l.dashed ? '6 8' : undefined }).addTo(g);
    }
    for (const mk of markers) {
      const marker = L.marker([mk.lat, mk.lng], {
        icon: L.divIcon({ className: '', html: mk.html, iconSize: mk.size, iconAnchor: [mk.size[0] / 2, mk.size[1] / 2] }),
        zIndexOffset: mk.z ?? 0,
      }).addTo(g);
      if (mk.popup) marker.bindTooltip(mk.popup, { direction: 'top', offset: [0, -mk.size[1] / 2] });
      if (mk.onClick) marker.on('click', mk.onClick);
      bounds.push([mk.lat, mk.lng]);
    }
    if (fitKey !== lastFit.current && bounds.length > 1) {
      lastFit.current = fitKey;
      m.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [markers, lines, polygons, fitKey]);

  return <div ref={el} style={{ position: 'absolute', inset: 0 }} />;
}
