import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { ripple, useEnter, usePressFeedback, useReducedMotion } from '../motion';
import {
  accentFor,
  card,
  colors,
  elevation,
  priorityColor,
  prioritySoft,
  radius,
  spacing,
  tabularNums,
  touch,
  typography,
  withAlpha,
} from '../theme';

export function Card({
  children,
  style,
  level = 1,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  level?: 1 | 2 | 3;
}) {
  return <View style={[styles.card, card(level), style]}>{children}</View>;
}

export function SectionHeader({
  label,
  action,
  onAction,
}: {
  label: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={typography.overline}>{label}</Text>
      {action ? (
        <Pressable
          onPress={onAction}
          hitSlop={touch.hitSlop}
          style={styles.sectionActionHit}
          accessibilityRole="button"
          accessibilityLabel={action}
          {...ripple(colors.primary)}
        >
          <Text style={styles.sectionAction} numberOfLines={1}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
  compact,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  accessibilityHint?: string;
}) {
  const inert = disabled || loading;
  const { onPressIn, onPressOut, animatedStyle } = usePressFeedback();
  const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: '#ffffff', border: colors.primary },
    secondary: { bg: colors.card, fg: colors.text, border: colors.controlBorder },
    success: { bg: colors.ok, fg: '#ffffff', border: colors.ok },
    danger: { bg: colors.danger, fg: '#ffffff', border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  };
  const p = palette[variant];
  return (
    <Pressable
      onPress={onPress}
      onPressIn={inert ? undefined : onPressIn}
      onPressOut={inert ? undefined : onPressOut}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      {...ripple(p.fg)}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        { backgroundColor: p.bg, borderColor: p.border },
        variant === 'secondary' && styles.btnSecondary,
        inert && styles.btnDisabled,
        pressed && !inert && styles.btnPressed,
        style,
      ]}
    >
      <Animated.View style={animatedStyle}>
        {loading ? (
          <ActivityIndicator size="small" color={p.fg} />
        ) : (
          <>
            {icon}
            <Text
              style={[styles.btnText, { color: p.fg }, compact && styles.btnTextCompact]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {label}
            </Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function Badge({
  label,
  color = colors.muted,
  background,
  style,
}: {
  label: string;
  color?: string;
  background?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.badge,
        { backgroundColor: background ?? withAlpha(color, 0.12) },
        style,
      ]}
    >
      <Text style={[styles.badgeText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function PriorityChip({ priority }: { priority: string }) {
  const key = priority.toLowerCase();
  return (
    <Badge
      label={priority.toUpperCase()}
      color={priorityColor[key] ?? colors.muted}
      background={prioritySoft[key] ?? colors.bgSoft}
    />
  );
}

/** Circular monogram used in lists and headers. */
export function Monogram({
  label,
  seed,
  size = 42,
}: {
  label: string;
  seed: string | number;
  size?: number;
}) {
  const accent = accentFor(seed);
  return (
    <View
      style={[
        styles.monogram,
        { width: size, height: size, borderRadius: size / 3, backgroundColor: withAlpha(accent, 0.14) },
      ]}
    >
      <Text style={[styles.monogramText, { color: accent, fontSize: size * 0.38 }]}>
        {label.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

export function StatTile({
  label,
  value,
  tone = colors.primary,
  onPress,
}: {
  label: string;
  value: string | number;
  tone?: string;
  onPress?: () => void;
}) {
  const body = (
    <View style={[styles.stat, { borderTopColor: tone }]} accessible accessibilityRole="text">
      <Text style={[styles.statValue, { color: tone }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.statFlex, pressed && styles.btnPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      {...ripple(colors.primary)}
    >
      {body}
    </Pressable>
  );
}

/** Horizontal labelled bar used for plant-pulse style metrics. */
export function Meter({
  label,
  value,
  suffix = '%',
  tone = colors.primary,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View style={styles.meter}>
      <View style={styles.meterTop}>
        <Text style={typography.bodyMuted}>{label}</Text>
        <Text style={[styles.meterValue, { color: tone }]}>
          {pct}
          {suffix}
        </Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${pct}%`, backgroundColor: tone }]} />
      </View>
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.kv}>
      <Text style={typography.bodyMuted}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={styles.kvValue}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

export function EmptyState({
  icon = '✓',
  title,
  hint,
}: {
  icon?: string;
  title: string;
  hint?: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>{icon}</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const enter = useEnter();
  return (
    <Animated.View
      style={[styles.errorBanner, { opacity: enter.opacity }]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          hitSlop={touch.hitSlop}
          style={styles.retryHit}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          {...ripple(colors.danger)}
        >
          <Text style={styles.errorRetry}>RETRY</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

/** Confirmation of an action that changed data on the server. */
export function SuccessBanner({ message }: { message: string }) {
  const enter = useEnter();
  return (
    <Animated.View
      style={[styles.successBanner, { opacity: enter.opacity }]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="checkmark-circle" size={18} color={colors.ok} />
      <Text style={styles.successText}>{message}</Text>
    </Animated.View>
  );
}

/** Shown when a role lacks the permission a screen requires. */
export function AccessDenied({ module: mod, action = 'view' }: { module: string; action?: string }) {
  return (
    <View style={styles.denied}>
      <View style={styles.deniedIcon}>
        <Text style={styles.deniedIconText}>🔒</Text>
      </View>
      <Text style={styles.deniedTitle}>Access restricted</Text>
      <Text style={styles.deniedBody}>
        Your role does not have “{action}” permission on {mod}. Contact your administrator if you
        believe this is wrong.
      </Text>
    </View>
  );
}

/**
 * One grey block of a loading placeholder.
 *
 * A skeleton shaped like the content it replaces beats a centred spinner: the
 * layout does not jump when data lands, and the wait reads as "this table is
 * arriving" rather than "something is broken".
 */
export function Skeleton({
  width,
  height = 12,
  radius: r = radius.sm,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: r,
          backgroundColor: colors.skeleton,
          opacity: reduced ? 0.85 : pulse,
        },
        style,
      ]}
    />
  );
}

/**
 * Full-screen placeholder that mirrors the app shell: a header block, optional
 * metric tiles, then either list rows or content cards.
 *
 * `rows` and `cards` are mutually exclusive; pass `rows` for list-shaped
 * screens and leave `cards` for dashboards and detail screens.
 */
export function ScreenSkeleton({
  label = 'Loading',
  tiles = 0,
  rows = 0,
  cards = 0,
}: {
  label?: string;
  tiles?: number;
  rows?: number;
  cards?: number;
}) {
  const cardCount = rows > 0 ? 0 : cards;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={styles.skelScreen}
    >
      <View style={styles.skelHeader}>
        <Skeleton width="52%" height={22} radius={radius.md} />
        <Skeleton width="34%" height={12} />
      </View>
      {tiles > 0 ? (
        <View style={styles.skelTiles}>
          {Array.from({ length: tiles }).map((_, index) => (
            <Skeleton
              key={index}
              style={styles.skelTile}
              height={76}
              radius={radius.lg}
            />
          ))}
        </View>
      ) : null}
      {rows > 0 ? (
        Array.from({ length: rows }).map((_, index) => (
          <View key={`r${index}`} style={styles.skelRow}>
            <Skeleton width={42} height={42} radius={radius.md} />
            <View style={styles.skelBody}>
              <Skeleton width="58%" height={13} />
              <Skeleton width="34%" height={11} />
            </View>
          </View>
        ))
      ) : (
        Array.from({ length: cardCount }).map((_, index) => (
          <View key={`c${index}`} style={styles.skelCard}>
            <Skeleton width="46%" height={14} />
            <Skeleton width="100%" height={12} />
            <Skeleton width="76%" height={12} />
          </View>
        ))
      )}
    </View>
  );
}

/** Placeholder for a screen whose content is a list of rows. */
export function ListSkeleton({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ gap: spacing.md }}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={styles.skelRow}>
          <Skeleton width={42} height={42} radius={radius.md} />
          <View style={styles.skelBody}>
            <Skeleton width="58%" height={13} />
            <Skeleton width="34%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Placeholder for a screen whose content is one record in a card. */
export function DetailSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ gap: spacing.lg }}>
      <View style={styles.skelCard}>
        <Skeleton width="46%" height={18} />
        <Skeleton width="28%" height={11} />
        <View style={styles.skelDivider} />
        <Skeleton width="100%" height={12} />
        <Skeleton width="92%" height={12} />
        <Skeleton width="64%" height={12} />
      </View>
      <View style={styles.skelCard}>
        <Skeleton width="34%" height={14} />
        <Skeleton width="80%" height={12} />
      </View>
    </View>
  );
}

/**
 * Spinner for short waits with no stable layout, such as the body of a modal
 * that has not fetched yet. Prefer `ListSkeleton`/`DetailSkeleton` for screens.
 */
export function Loading({ label }: { label?: string }) {
  return (
    <View
      style={styles.loading}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={styles.loadingText}>{label}</Text> : null}
    </View>
  );
}

/**
 * Label above, control in the middle, hint or error beneath.
 *
 * The label is a real element rather than a placeholder, because a placeholder
 * vanishes the moment the field is filled and leaves the input unlabelled for
 * anyone reading the screen with a screen reader.
 */
export function Field({
  label,
  required,
  hint,
  error,
  children,
  style,
}: {
  /** Omitted for a field repeated in a list, where the row itself is the label. */
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, style]}>
      {label ? (
        <Text style={styles.fieldLabel}>
          {label}
          {required ? <Text style={styles.fieldRequired}> *</Text> : null}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text style={styles.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/**
 * Labelled text input. The visible label doubles as the accessibility name,
 * since React Native does not associate a sibling `Text` with the field.
 */
export function TextField({
  label,
  required,
  hint,
  error,
  multiline,
  containerStyle,
  ...rest
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  multiline?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
} & TextInputProps) {
  const spoken = rest.accessibilityLabel ?? label ?? rest.placeholder;
  return (
    <Field
      label={label}
      required={required}
      hint={hint}
      error={error}
      style={containerStyle}
    >
      <TextInput
        {...rest}
        multiline={multiline}
        placeholderTextColor={colors.textLight}
        accessibilityLabel={spoken}
        accessibilityHint={hint}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          !!error && styles.inputError,
          rest.style,
        ]}
      />
    </Field>
  );
}

/**
 * Pill toggle for filters and view switchers.
 *
 * The selected state is exposed through `accessibilityState.selected` rather
 * than colour alone, so the control is usable by touch exploration instead of
 * only by sight.
 */
export function Chip({
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  /** Spoken name when the visible text alone is too terse, e.g. "Quantity 10". */
  accessibilityLabel?: string;
}) {
  const { onPressIn, onPressOut, animatedStyle } = usePressFeedback();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      {...ripple(active ? '#ffffff' : colors.primary)}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Animated.View style={animatedStyle}>
        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Single-choice row used for pickers (choose a product, choose an action).
 * Exposed as a radio so assistive tech announces it as one of N options
 * instead of N unrelated buttons.
 */
export function OptionRow({
  label,
  sublabel,
  monogram,
  selected,
  onPress,
  trailing,
  style,
}: {
  label: string;
  sublabel?: string;
  monogram?: ReactNode;
  selected: boolean;
  onPress: () => void;
  /** Right-hand slot, e.g. a price. */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { onPressIn, onPressOut, animatedStyle } = usePressFeedback();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="radio"
      accessibilityLabel={[label, sublabel, trailing].filter(Boolean).join(', ')}
      accessibilityState={{ selected, checked: selected }}
      {...ripple(colors.primary)}
      style={[
        styles.option,
        selected && styles.optionSelected,
        style,
      ]}
    >
      <Animated.View style={animatedStyle}>
        {monogram ? <View style={styles.optionMonogram}>{monogram}</View> : null}
        <View style={styles.optionBody}>
          <Text style={styles.optionLabel} numberOfLines={1}>
            {label}
          </Text>
          {sublabel ? (
            <Text style={[styles.optionSub, selected && styles.optionSubSelected]} numberOfLines={1}>
              {sublabel}
            </Text>
          ) : null}
        </View>
        {trailing}
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={20}
          color={selected ? colors.primary : colors.textLight}
        />
      </Animated.View>
    </Pressable>
  );
}

/**
 * Quantity stepper for goods receipt and counting.
 *
 * Buttons are a full 44pt square. The previous 30pt controls were accurate
 * with bare fingertips and painful with gloves on, which is the actual
 * condition on a plant floor.
 */
export function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  unit,
  inputValue,
  onChangeInput,
  inputPlaceholder,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** When set, the middle becomes a numeric field instead of static text. */
  inputValue?: string;
  onChangeInput?: (next: string) => void;
  inputPlaceholder?: string;
}) {
  const canDecrease = value > min;
  const canIncrease = value < max;

  const middle = inputValue !== undefined ? (
    <TextInput
      value={inputValue}
      onChangeText={onChangeInput}
      keyboardType="numeric"
      placeholder={inputPlaceholder}
      placeholderTextColor={colors.textLight}
      style={styles.stepInput}
      accessibilityLabel={`${label} amount`}
    />
  ) : (
    <Text
      style={styles.stepValue}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}
    >
      {value}
    </Text>
  );

  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - step))}
        disabled={!canDecrease}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        accessibilityState={{ disabled: !canDecrease }}
        hitSlop={6}
        {...ripple(colors.text)}
        style={({ pressed }) => [
          styles.stepBtn,
          pressed && styles.btnPressed,
          !canDecrease && styles.stepBtnDisabled,
        ]}
      >
        <Ionicons
          name="remove"
          size={20}
          color={canDecrease ? colors.text : colors.textLight}
        />
      </Pressable>

      {middle}

      <Pressable
        onPress={() => onChange(Math.min(max, value + step))}
        disabled={!canIncrease}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        accessibilityState={{ disabled: !canIncrease }}
        hitSlop={6}
        {...ripple(colors.text)}
        style={({ pressed }) => [
          styles.stepBtn,
          pressed && styles.btnPressed,
          !canIncrease && styles.stepBtnDisabled,
        ]}
      >
        <Ionicons
          name="add"
          size={20}
          color={canIncrease ? colors.text : colors.textLight}
        />
      </Pressable>
    </View>
  );
}

export function Row({
  children,
  style,
  gap = spacing.md,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionAction: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  sectionActionHit: {
    minHeight: touch.compact,
    justifyContent: 'center',
    paddingLeft: spacing.sm,
  },
  btn: {
    minHeight: touch.min + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  btnCompact: {
    minHeight: touch.compact,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  btnSecondary: { backgroundColor: colors.card },
  btnDisabled: { opacity: 0.45 },
  btnPressed: { opacity: 0.75 },
  btnText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  btnTextCompact: { fontSize: 13 },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  monogram: { alignItems: 'center', justifyContent: 'center' },
  monogramText: { fontWeight: '800' },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 3,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    ...elevation(1),
  },
  statFlex: { flex: 1 },
  statValue: { fontSize: 24, fontWeight: '800', ...tabularNums },
  statLabel: { ...typography.caption, marginTop: 2, textAlign: 'center' },
  meter: { marginBottom: spacing.lg },
  meterTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  meterValue: { fontSize: 14, fontWeight: '800', ...tabularNums },
  meterTrack: { height: 7, borderRadius: radius.pill, backgroundColor: colors.bgSoft, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: radius.pill },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.lg,
  },
  kvValue: {
    ...typography.body,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    ...tabularNums,
  },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyIconText: { fontSize: 24, color: colors.primary, fontWeight: '800' },
  emptyTitle: { ...typography.section, textAlign: 'center' },
  emptyHint: { ...typography.bodyMuted, textAlign: 'center', marginTop: spacing.xs },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: 13, flex: 1 },
  errorRetry: { color: colors.danger, fontWeight: '800', fontSize: 12, letterSpacing: 0.6 },
  retryHit: { minHeight: touch.compact, justifyContent: 'center', paddingLeft: spacing.sm },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.okSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successText: { color: colors.ok, fontSize: 13, fontWeight: '600', flex: 1 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  deniedIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.warnSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  deniedIconText: { fontSize: 28 },
  deniedTitle: { ...typography.title, marginBottom: spacing.sm },
  deniedBody: { ...typography.bodyMuted, textAlign: 'center', lineHeight: 20 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.bodyMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md },
  skelScreen: { gap: spacing.lg },
  skelHeader: { gap: spacing.sm },
  skelTiles: { flexDirection: 'row', gap: spacing.md },
  skelTile: { flex: 1 },
  skelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  skelBody: { flex: 1, gap: spacing.sm },
  chip: {
    minHeight: touch.compact,
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: '700' },
  chipTextActive: { color: '#ffffff' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.min + 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSoft,
  },
  optionSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primarySoft,
  },
  optionMonogram: { width: 32, height: 32 },
  optionBody: { flex: 1 },
  optionLabel: { ...typography.body, fontWeight: '600' },
  optionSub: { ...typography.caption, marginTop: 1 },
  /** Caption grey is 4.08:1 on primarySoft, so a selected row steps up to text. */
  optionSubSelected: { color: colors.text },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepBtn: {
    width: touch.min,
    height: touch.min,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  stepBtnDisabled: { opacity: 0.5 },
  stepValue: {
    minWidth: 54,
    textAlign: 'center',
    ...typography.metric,
  },
  stepInput: {
    minWidth: 68,
    minHeight: touch.compact,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.bgSoft,
    color: colors.text,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    ...tabularNums,
  },
  skelCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  skelDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  field: { gap: 6 },
  fieldLabel: { ...typography.caption, fontWeight: '700', color: colors.text },
  fieldRequired: { color: colors.danger, fontWeight: '700' },
  fieldHint: { ...typography.caption, color: colors.muted },
  fieldError: { ...typography.caption, color: colors.danger, fontWeight: '600' },
  input: {
    minHeight: touch.min + 2,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
});