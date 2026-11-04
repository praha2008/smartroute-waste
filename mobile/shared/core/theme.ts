import { APP } from '../appConfig';

export const colors = {
  accent: APP.accent,
  accentDark: APP.accentDark,
  accentSoft: APP.accentSoft,
  gradient: APP.gradient as readonly [string, string],
  bg: '#F4F6F5',
  card: '#FFFFFF',
  field: '#F1F4F3',
  text: '#101914',
  textMuted: '#5B6762',
  textFaint: '#94A09B',
  border: '#E3E8E5',
  danger: '#D93636',
  dangerSoft: '#FDECEC',
  warning: '#B26A00',
  warningSoft: '#FFF3DD',
  success: '#21864A',
  successSoft: '#E6F5EC',
  info: '#1F5FBF',
  infoSoft: '#E5EFFC',
  white: '#FFFFFF',
  ink: '#0F1F19',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

export const font = {
  display: { fontSize: 30, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.6 },
  h1: { fontSize: 26, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.2 },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  small: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  tiny: { fontSize: 11, color: colors.textFaint, fontWeight: '700' as const, letterSpacing: 0.6 },
};

export const shadow = {
  shadowColor: '#0B1F16',
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

export const shadowSoft = {
  shadowColor: '#0B1F16',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};
