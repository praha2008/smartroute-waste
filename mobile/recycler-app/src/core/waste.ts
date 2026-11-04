/** Display metadata for waste types, urgency and statuses (mirrors backend config). Labels follow the app language. */
import { t } from './i18n';

export type WasteType = 'organic' | 'recyclable' | 'hazardous' | 'e_waste' | 'general';
export type Urgency = 'low' | 'medium' | 'high' | 'critical';

interface WasteMeta {
  readonly label: string;
  readonly short: string;
  readonly hint: string;
  color: string;
  soft: string;
  icon: string;
}

function waste(key: WasteType, color: string, soft: string, icon: string): WasteMeta {
  return {
    color,
    soft,
    icon,
    get label() {
      return t(`waste.${key}`);
    },
    get short() {
      return t(`waste.${key}.short`);
    },
    get hint() {
      return t(`waste.${key}.hint`);
    },
  };
}

export const WASTE: Record<WasteType, WasteMeta> = {
  organic: waste('organic', '#2E7D32', '#E8F5E9', 'leaf'),
  recyclable: waste('recyclable', '#1565C0', '#E3F0FC', 'refresh-circle'),
  hazardous: waste('hazardous', '#C62828', '#FDECEA', 'warning'),
  e_waste: waste('e_waste', '#6A1B9A', '#F3E5F5', 'hardware-chip'),
  general: waste('general', '#616161', '#EEEEEE', 'trash'),
};

export const WASTE_ORDER: WasteType[] = ['organic', 'recyclable', 'general', 'e_waste', 'hazardous'];

function urg(key: Urgency, color: string, soft: string, icon: string) {
  return {
    color,
    soft,
    icon,
    get label() {
      return t(`urg.${key}`);
    },
    get hint() {
      return t(`urg.${key}.hint`);
    },
  };
}

export const URGENCY: Record<Urgency, { readonly label: string; readonly hint: string; color: string; soft: string; icon: string }> = {
  low: urg('low', '#2E7D32', '#E8F5E9', 'leaf-outline'),
  medium: urg('medium', '#1565C0', '#E3F0FC', 'time-outline'),
  high: urg('high', '#B26A00', '#FFF4E0', 'flash-outline'),
  critical: urg('critical', '#C62828', '#FDECEA', 'alert-circle-outline'),
};

export const URGENCY_ORDER: Urgency[] = ['low', 'medium', 'high', 'critical'];

const STATUS_COLORS: Record<string, [string, string]> = {
  pending: ['#B26A00', '#FFF4E0'],
  scheduled: ['#1565C0', '#E3F0FC'],
  in_progress: ['#6A1B9A', '#F3E5F5'],
  collected: ['#2E7D32', '#E8F5E9'],
  missed: ['#C62828', '#FDECEA'],
  cancelled: ['#616161', '#EEEEEE'],
  done: ['#2E7D32', '#E8F5E9'],
  skipped: ['#C62828', '#FDECEA'],
  available: ['#2E7D32', '#E8F5E9'],
  claimed: ['#1565C0', '#E3F0FC'],
  picked: ['#616161', '#EEEEEE'],
  planned: ['#1565C0', '#E3F0FC'],
  active: ['#6A1B9A', '#F3E5F5'],
  completed: ['#2E7D32', '#E8F5E9'],
};

export function wasteMeta(type: string) {
  return WASTE[type as WasteType] ?? WASTE.general;
}

export function statusMeta(s: string) {
  const [color, soft] = STATUS_COLORS[s] ?? ['#616161', '#EEEEEE'];
  const key = `status.${s}`;
  const label = t(key);
  return { label: label === key ? s : label, color, soft };
}
