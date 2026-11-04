import { APP } from '../appConfig';

export const colors = {
  accent: APP.accent,
  accentDark: APP.accentDark,
  accentSoft: APP.accentSoft,
  bg: '#F4F6F5',
  card: '#FFFFFF',
  text: '#15201B',
  textMuted: '#5F6B66',
  textFaint: '#8F9A95',
  border: '#E1E6E3',
  danger: '#C62828',
  dangerSoft: '#FDECEA',
  warning: '#B26A00',
  warningSoft: '#FFF4E0',
  success: '#2E7D32',
  successSoft: '#E8F5E9',
  info: '#1565C0',
  infoSoft: '#E3F0FC',
  white: '#FFFFFF',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const font = {
  h1: { fontSize: 26, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  tiny: { fontSize: 11, color: colors.textFaint, fontWeight: '600' as const, letterSpacing: 0.4 },
};

export const shadow = {
  shadowColor: '#0B1F16',
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};
