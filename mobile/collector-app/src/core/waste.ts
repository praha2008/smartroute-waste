/** Display metadata for waste types, urgency and statuses (mirrors backend config). */
export type WasteType = 'organic' | 'recyclable' | 'hazardous' | 'e_waste' | 'general';
export type Urgency = 'low' | 'medium' | 'high' | 'critical';

export const WASTE: Record<WasteType, { label: string; short: string; color: string; soft: string; icon: string; hint: string }> = {
  organic: { label: 'Organic / Wet', short: 'Organic', color: '#2E7D32', soft: '#E8F5E9', icon: 'leaf', hint: 'Food scraps, vegetable peels, garden waste' },
  recyclable: { label: 'Dry Recyclable', short: 'Recyclable', color: '#1565C0', soft: '#E3F0FC', icon: 'refresh-circle', hint: 'Plastic, paper, cardboard, metal, glass' },
  hazardous: { label: 'Hazardous', short: 'Hazardous', color: '#C62828', soft: '#FDECEA', icon: 'warning', hint: 'Chemicals, paint, batteries, medical waste' },
  e_waste: { label: 'E-Waste', short: 'E-Waste', color: '#6A1B9A', soft: '#F3E5F5', icon: 'hardware-chip', hint: 'Phones, chargers, cables, small appliances' },
  general: { label: 'Mixed / General', short: 'Mixed', color: '#616161', soft: '#EEEEEE', icon: 'trash', hint: 'Unsegregated household waste' },
};

export const WASTE_ORDER: WasteType[] = ['organic', 'recyclable', 'general', 'e_waste', 'hazardous'];

export const URGENCY: Record<Urgency, { label: string; color: string; soft: string; hint: string }> = {
  low: { label: 'Low', color: '#2E7D32', soft: '#E8F5E9', hint: 'Flexible · earn +5 bonus credits' },
  medium: { label: 'Medium', color: '#1565C0', soft: '#E3F0FC', hint: 'Normal pickup window' },
  high: { label: 'High', color: '#B26A00', soft: '#FFF4E0', hint: 'Within half the usual time' },
  critical: { label: 'Critical', color: '#C62828', soft: '#FDECEA', hint: 'Overflowing / health risk' },
};

export const URGENCY_ORDER: Urgency[] = ['low', 'medium', 'high', 'critical'];

export const STATUS: Record<string, { label: string; color: string; soft: string }> = {
  pending: { label: 'Waiting', color: '#B26A00', soft: '#FFF4E0' },
  scheduled: { label: 'Scheduled', color: '#1565C0', soft: '#E3F0FC' },
  in_progress: { label: 'Truck on the way', color: '#6A1B9A', soft: '#F3E5F5' },
  collected: { label: 'Collected', color: '#2E7D32', soft: '#E8F5E9' },
  missed: { label: 'Missed', color: '#C62828', soft: '#FDECEA' },
  cancelled: { label: 'Cancelled', color: '#616161', soft: '#EEEEEE' },
  // route stops / lots
  done: { label: 'Done', color: '#2E7D32', soft: '#E8F5E9' },
  skipped: { label: 'Skipped', color: '#C62828', soft: '#FDECEA' },
  available: { label: 'Available', color: '#2E7D32', soft: '#E8F5E9' },
  claimed: { label: 'Claimed', color: '#1565C0', soft: '#E3F0FC' },
  picked: { label: 'Picked up', color: '#616161', soft: '#EEEEEE' },
  planned: { label: 'Planned', color: '#1565C0', soft: '#E3F0FC' },
  active: { label: 'Active', color: '#6A1B9A', soft: '#F3E5F5' },
  completed: { label: 'Completed', color: '#2E7D32', soft: '#E8F5E9' },
};

export function wasteMeta(t: string) {
  return WASTE[(t as WasteType)] ?? WASTE.general;
}
export function statusMeta(s: string) {
  return STATUS[s] ?? { label: s, color: '#616161', soft: '#EEEEEE' };
}
