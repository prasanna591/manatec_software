import { Platform, type TextStyle } from 'react-native';

/**
 * Every foreground/background pair used by the UI is checked against WCAG 2.1 AA.
 * `muted`, `textLight`, `danger`, `teal` and `controlBorder` are tuned (not the
 * stock Tailwind values) because the originals failed on their own surfaces:
 * `muted` on `bg` was 4.34:1 and `textLight` on `bg` was 2.34:1.
 * Do not "restore" these to the default palette without re-running the check.
 */
export const colors = {
  primary: '#1d4ed8',
  primaryDark: '#1e3a8a',
  primaryDeep: '#172554',
  primarySoft: '#dbeafe',
  bg: '#f1f5f9',
  card: '#ffffff',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  /** 3:1 on card. Outlines interactive controls only (WCAG 1.4.11). */
  controlBorder: '#8e959e',
  bgSoft: '#f8fafc',
  cardSoft: '#f8fafc',
  text: '#0f172a',
  muted: '#617187',
  textLight: '#66707f',
  danger: '#ca2323',
  dangerSoft: '#fee2e2',
  warn: '#b45309',
  warnSoft: '#fef3c7',
  ok: '#15803d',
  okSoft: '#dcfce7',
  info: '#0369a1',
  infoSoft: '#e0f2fe',
  violet: '#7c3aed',
  violetSoft: '#ede9fe',
  teal: '#0b7c72',
  tealSoft: '#ccfbf1',
  orange: '#9a3412',
  orangeSoft: '#ffedd5',
  pink: '#be185d',
  pinkSoft: '#fce7f3',
  surface: '#fafafa',
  overlay: 'rgba(15, 23, 42, 0.45)',
  /** Skeleton base + sheen. Reserved for loading placeholders, nothing else. */
  skeleton: '#e2e8f0',
  skeletonSheen: '#eef2f6',
  focusRing: '#1d4ed8',
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
  pill: 999,
} as const;

/**
 * Touch targets. 44 is the comfortable floor for one-handed, gloved use on a
 * plant floor; 36 is the WCAG 2.2 AA minimum (2.5.8) and is only acceptable
 * for secondary controls inside a dense row.
 */
export const touch = {
  min: 44,
  compact: 36,
  hitSlop: 8,
} as const;

/**
 * Equal-width digits for quantities, money and timestamps so columns of
 * numbers stay aligned while values tick. iOS-only because Android's
 * `fontVariant` support is incomplete.
 */
export const tabularNums: TextStyle = Platform.select({
  ios: { fontVariant: ['tabular-nums'] },
  default: {},
}) as TextStyle;

/** Cross-platform elevation: iOS shadow*, Android elevation. */
export function elevation(level: 1 | 2 | 3) {
  if (Platform.OS === 'android') return { elevation: level * 2 };
  const spec = {
    1: { shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
    2: { shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    3: { shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  }[level];
  return {
    shadowColor: '#0f172a',
    shadowOpacity: spec.shadowOpacity,
    shadowRadius: spec.shadowRadius,
    shadowOffset: spec.shadowOffset,
    elevation: level * 2,
  };
}

/** Shared card surface so every screen reads as one system. */
export function card(level: 1 | 2 | 3 = 1) {
  return {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation(level),
  };
}

export const priorityColor: Record<string, string> = {
  urgent: colors.danger,
  critical: colors.danger,
  high: colors.warn,
  medium: colors.info,
  normal: colors.muted,
  low: colors.textLight,
};

export const prioritySoft: Record<string, string> = {
  urgent: colors.dangerSoft,
  critical: colors.dangerSoft,
  high: colors.warnSoft,
  medium: colors.infoSoft,
  normal: colors.bgSoft,
  low: colors.bgSoft,
};

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const typography = {
  display: { fontSize: 28, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
  title: { fontSize: 21, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.3 },
  section: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 14, color: colors.text },
  bodyMuted: { fontSize: 14, color: colors.muted },
  caption: { fontSize: 12, color: colors.muted },
  overline: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: colors.textLight,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
  },
  /** Quantities, money and ledger amounts. Tabular so columns stay aligned. */
  amount: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.text,
    ...tabularNums,
  },
  /** Small labelled metric, e.g. a stepper's current value. */
  metric: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: colors.text,
    ...tabularNums,
  },
} as const;

/** Deterministic accent per entity so list rows stay visually distinguishable. */
export const ACCENTS = [
  colors.primary,
  colors.teal,
  colors.violet,
  colors.orange,
  colors.pink,
  colors.info,
  colors.ok,
  colors.warn,
] as const;

export function accentFor(seed: string | number): string {
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return ACCENTS[h % ACCENTS.length];
}

export function formatCurrency(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * Rendered wherever a record has no value for a field. An em dash reads as a
 * placeholder glyph that some screen readers announce inconsistently, so a
 * word is used instead.
 */
export const NOT_SET = 'Not set';

export function formatDate(value: string | null | undefined): string {
  if (!value) return NOT_SET;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return NOT_SET;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${formatDate(value)} · ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}