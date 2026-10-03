export const colors = {
  primary: '#1d4ed8',
  primaryDark: '#1e40af',
  primarySoft: '#e0f2fe',
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  bgSoft: '#f1f5f9',
  cardSoft: '#f8fafc',
  text: '#0f172a',
  muted: '#64748b',  // Add back for compatibility
  textLight: '#94a3b8',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  warn: '#b45309',
  warnSoft: '#fef3c7',
  ok: '#15803d',
  okSoft: '#dcfce7',
  surface: '#fafafa',
} as const;

export const spacing = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
} as const;

export const shadow = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
} as const;

export const priorityColor: Record<string, string> = {
  urgent: colors.danger,
  critical: colors.danger,
  high: colors.warn,
  normal: colors.textMuted,
  low: colors.textMuted,
};
