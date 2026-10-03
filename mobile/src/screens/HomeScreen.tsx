import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { api } from '../api/client';
import type { DashboardKpis, Notification, Task } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { colors, priorityColor, spacing } from '../theme';
import { setUnread } from '../unread';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

const isOpen = (t: Task) => t.status === 'open' || t.status === 'in_progress';

export default function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
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
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const openTasks = tasks.filter(isOpen);
  const approvals = openTasks.filter((t) => t.type === 'approval');
  const current =
    openTasks.find((t) => t.status === 'in_progress') ?? openTasks[0] ?? null;
  const urgent = alerts.filter((n) => n.priority === 'critical' || n.priority === 'urgent');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.greeting}>
        {greeting()}, {user?.employee?.name ?? user?.username}
      </Text>
      <Text style={styles.subtle}>
        {user?.role} · {user?.employee?.code ?? '—'}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionLabel}>TODAY</Text>
      <View style={styles.kpiRow}>
        <Kpi label="My Tasks" value={openTasks.length} onPress={() => navigation.navigate('Tasks')} />
        <Kpi label="Approvals" value={approvals.length} onPress={() => navigation.navigate('Tasks')} />
        <Kpi
          label="Notifications"
          value={alerts.length}
          onPress={() => navigation.navigate('Notifications')}
        />
      </View>

      <Text style={styles.sectionLabel}>CURRENT TASK</Text>
      <View style={styles.card}>
        {current ? (
          <>
            <Text style={styles.cardTitle}>{current.title}</Text>
            {current.description ? (
              <Text style={styles.cardBody}>{current.description}</Text>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {current.source_ref ? `Ref ${current.source_ref} · ` : ''}
                {current.status.replace('_', ' ')}
              </Text>
              <Text style={[styles.meta, { color: priorityColor[current.priority] ?? colors.muted }]}>
                {current.priority}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.action}
              onPress={() => navigation.navigate('Tasks')}
              activeOpacity={0.8}
            >
              <Text style={styles.actionText}>UPDATE PROGRESS</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.cardBody}>No tasks assigned. You are all caught up.</Text>
        )}
      </View>

      <Text style={styles.sectionLabel}>URGENT</Text>
      <View style={styles.card}>
        {urgent.length === 0 ? (
          <Text style={styles.cardBody}>Nothing urgent right now.</Text>
        ) : (
          urgent.map((n) => (
            <View key={n.id} style={styles.urgentRow}>
              <View style={styles.dot} />
              <Text style={styles.urgentText}>
                {n.title}
                {n.entity_ref ? `  (${n.entity_ref})` : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.sectionLabel}>PLANT PULSE</Text>
      <View style={styles.card}>
        <Pulse label="Production completion" value={`${kpis?.production_pct ?? 0}%`} />
        <Pulse label="Inventory health" value={`${kpis?.inventory_pct ?? 0}%`} />
        <Pulse label="Open orders" value={`${kpis?.orders_open ?? 0} / ${kpis?.orders ?? 0}`} />
        <Pulse label="Delayed orders" value={`${kpis?.delayed_orders ?? 0}`} />
        <Pulse label="Material alerts" value={`${kpis?.material_alerts ?? 0}`} />
      </View>
    </ScrollView>
  );
}

function Kpi({ label, value, onPress }: { label: string; value: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.kpi} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function Pulse({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.pulseRow}>
      <Text style={styles.pulseLabel}>{label}</Text>
      <Text style={styles.pulseValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtle: { color: colors.muted, marginTop: 2, marginBottom: spacing.md },
  error: { color: colors.danger, marginBottom: spacing.md },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  kpiRow: { flexDirection: 'row', gap: spacing.md },
  kpi: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiValue: { fontSize: 26, fontWeight: '700', color: colors.primary },
  kpiLabel: { color: colors.muted, fontSize: 12, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  cardBody: { color: colors.muted, marginTop: spacing.xs, fontSize: 14 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  meta: { color: colors.muted, fontSize: 13, textTransform: 'capitalize' },
  action: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  actionText: { color: '#fff', fontWeight: '700', letterSpacing: 0.5 },
  urgentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    marginRight: spacing.sm,
  },
  urgentText: { color: colors.text, flex: 1, fontSize: 14 },
  pulseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pulseLabel: { color: colors.muted, fontSize: 14 },
  pulseValue: { color: colors.text, fontWeight: '700', fontSize: 14 },
});
