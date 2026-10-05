import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../api/client';
import type { DashboardKpis, Notification, Task } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { messageOf } from '../auth/session';
import {
  Badge,
  Button,
  Card,
  Divider,
  ErrorBanner,
  Meter,
  PriorityChip,
  ScreenSkeleton,
  SectionHeader,
} from '../components/ui';
import { ripple } from '../motion';
import { colors, radius, spacing, typography, withAlpha } from '../theme';
import { setUnread } from '../unread';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const isOpen = (t: Task) => t.status === 'open' || t.status === 'in_progress';

export default function HomeScreen() {
  const { user, isInRole } = useAuth();
  const navigation = useNavigation<any>();
  const isManager = isInRole(['ADMIN', 'MGMT', 'DH']);

  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [alerts, setAlerts] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [overview, myTasks, notifications] = await Promise.all([
        api.dashboardOverview(),
        api.myTasks(),
        api.notifications(true),
      ]);
      setKpis(overview.kpis);
      setTasks(myTasks);
      setAlerts(notifications);
      setUnread(notifications.length);
    } catch (e) {
      setError(messageOf(e, 'Failed to load your dashboard'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) return <ScreenSkeleton label="Loading your dashboard" tiles={4} cards={2} />;

  const openTasks = tasks.filter(isOpen);
  const approvals = openTasks.filter((t) => t.type === 'approval');
  const current = openTasks.find((t) => t.status === 'in_progress') ?? openTasks[0] ?? null;
  const urgent = alerts.filter(
    (n) => n.priority === 'critical' || n.priority === 'urgent',
  );
  const firstName = (user?.employee?.name ?? user?.username ?? '').split(' ')[0];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.greeting}>
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </Text>
        <Text style={styles.subtle}>
          {user?.role} · {user?.employee?.code ?? user?.username}
        </Text>

        <View style={styles.kpiRow}>
          <Pressable
            style={styles.kpi}
            onPress={() => navigation.navigate('Tasks')}
            accessibilityRole="button"
            accessibilityLabel={`Open tasks: ${openTasks.length}`}
            accessibilityHint="Goes to your task list"
            {...ripple(colors.primary)}
          >
            <Text style={styles.kpiValue}>{openTasks.length}</Text>
            <Text style={styles.kpiLabel}>Open tasks</Text>
          </Pressable>
          <Pressable
            style={styles.kpi}
            onPress={() => navigation.navigate('Tasks')}
            accessibilityRole="button"
            accessibilityLabel={`Approvals waiting: ${approvals.length}`}
            accessibilityHint="Goes to your task list, filtered to approvals"
            {...ripple(colors.primary)}
          >
            <Text style={[styles.kpiValue, approvals.length > 0 && styles.kpiAlert]}>
              {approvals.length}
            </Text>
            <Text style={styles.kpiLabel}>Approvals</Text>
          </Pressable>
          <Pressable
            style={styles.kpi}
            onPress={() => navigation.navigate('Notifications')}
            accessibilityRole="button"
            accessibilityLabel={`Unread notifications: ${alerts.length}`}
            accessibilityHint="Goes to your notifications"
            {...ripple(colors.primary)}
          >
            <Text style={[styles.kpiValue, alerts.length > 0 && styles.kpiAlert]}>
              {alerts.length}
            </Text>
            <Text style={styles.kpiLabel}>Unread</Text>
          </Pressable>
        </View>
      </View>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      <SectionHeader label={current ? 'In progress' : 'Your work'} />
      <Card style={styles.card}>
        {current ? (
          <>
            <View style={styles.taskTop}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {current.title}
              </Text>
              <PriorityChip priority={current.priority} />
            </View>
            {current.description ? (
              <Text style={styles.cardBody} numberOfLines={3}>
                {current.description}
              </Text>
            ) : null}
            <View style={styles.metaRow}>
              <Badge
                label={current.status.replace('_', ' ').toUpperCase()}
                color={current.status === 'in_progress' ? colors.info : colors.muted}
              />
              {current.source_ref ? (
                <Text style={typography.caption}>{current.source_ref}</Text>
              ) : null}
            </View>
            <Button
              label="Update progress"
              compact
              style={styles.taskBtn}
              onPress={() => navigation.navigate('Tasks')}
            />
          </>
        ) : (
          <View style={styles.allClear}>
            <Ionicons name="checkmark-circle" size={28} color={colors.ok} />
            <Text style={styles.allClearText}>Nothing assigned. You are all caught up.</Text>
          </View>
        )}
      </Card>

      {urgent.length > 0 ? (
        <>
          <SectionHeader label={`Urgent (${urgent.length})`} />
          <Card style={styles.card}>
            {urgent.map((n, i) => (
              <View key={n.id}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.urgentRow}>
                  <View style={styles.dot} />
                  <Text style={styles.urgentText} numberOfLines={2}>
                    {n.title}
                    {n.entity_ref ? ` (${n.entity_ref})` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader label={isManager ? 'Plant pulse' : 'Plant pulse (read-only)'} />
      <Card style={styles.card}>
        <Pulse label="Production completion" value={kpis?.production_pct ?? 0} suffix="%" />
        <Pulse label="Inventory health" value={kpis?.inventory_pct ?? 0} suffix="%" />
        <View style={styles.pulseRow}>
          <Text style={styles.pulseLabel}>Open orders</Text>
          <Text style={styles.pulseValue}>
            {kpis?.orders_open ?? 0} / {kpis?.orders ?? 0}
          </Text>
        </View>
        <Pulse label="Delayed orders" value={kpis?.delayed_orders ?? 0} />
        <Pulse label="Material alerts" value={kpis?.material_alerts ?? 0} />
        {!isManager ? (
          <Text style={styles.readOnlyNote}>
            Plant-wide figures are informational for your role.
          </Text>
        ) : null}
      </Card>
    </ScrollView>
  );
}

function Pulse({ label, value, suffix = '%' }: { label: string; value: number; suffix?: string }) {
  return (
    <View style={styles.pulseBlock}>
      <Meter
        label={label}
        value={value}
        suffix={suffix}
        tone={value >= 90 ? colors.ok : value >= 70 ? colors.warn : colors.danger}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  hero: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  greeting: { ...typography.title, color: '#ffffff' },
  subtle: { fontSize: 13, color: withAlpha('#ffffff', 0.75), marginTop: 2 },
  kpiRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  kpi: {
    flex: 1,
    backgroundColor: withAlpha('#ffffff', 0.12),
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  kpiValue: { fontSize: 24, fontWeight: '800', color: '#ffffff' },
  kpiAlert: { color: withAlpha(colors.warn, 1) },
  kpiLabel: { fontSize: 11, color: withAlpha('#ffffff', 0.75), marginTop: 2 },
  card: { marginBottom: spacing.md },
  taskTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { ...typography.body, fontWeight: '700', fontSize: 15, flex: 1 },
  cardBody: { ...typography.bodyMuted, marginTop: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  taskBtn: { marginTop: spacing.lg },
  allClear: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  allClearText: { ...typography.bodyMuted, textAlign: 'center' },
  urgentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  urgentText: { ...typography.body, flex: 1 },
  pulseBlock: { marginBottom: spacing.md },
  pulseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  pulseLabel: { ...typography.caption, fontSize: 13 },
  pulseValue: { ...typography.body, fontWeight: '700' },
  readOnlyNote: { ...typography.caption, color: colors.warn, marginTop: spacing.sm },
});