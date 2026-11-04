export const APP = {
  role: 'collector' as const,
  name: 'SmartRoute Driver',
  tagline: 'Your optimized collection route, stop by stop.',
  icon: 'bus',
  accent: '#1E4E8C',
  accentDark: '#14365F',
  gradient: ['#2F6FC4', '#132F57'] as const,
  accentSoft: '#E4ECF7',
  allowRegister: false, // driver accounts are created by the admin
  demo: { email: 'driver1@smartroute.in', password: 'driver123' },
};
