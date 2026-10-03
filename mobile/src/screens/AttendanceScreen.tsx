import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../api/client';
import type { AttendanceRow, Roster, RosterRow } from '../api/types';
import { colors, spacing } from '../theme';

export default function AttendanceScreen() {
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [t, h] = await Promise.all([api.attendanceToday(), api.attendanceMe()]);
      setToday(t);
      setHistory(h);
      try {
        setRoster(await api.attendanceRoster());
      } catch {
        setRoster(null); // not a dept head / HR → no roster
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load attendance');
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

  const act = useCallback(
    async (fn: () => Promise<AttendanceRow>) => {
      setBusy(true);
      try {
        setToday(await fn());
        setHistory(await api.attendanceMe());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const status = today?.status ?? 'absent';
  const statusMeta = {
    absent: { label: 'NOT CHECKED IN', color: colors.danger },
    present: { label: 'ON SITE', color: colors.ok },
    checked_out: { label: 'CHECKED OUT', color: colors.muted },
  }[status];

  return (
    <FlatList<AttendanceRow>
      style={styles.screen}
      data={history}
      keyExtractor={(r) => `${r.work_date}-${r.id}`}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <View>
          <Text style={styles.sectionLabel}>TODAY</Text>
          <View style={styles.card}>
            <View style={styles.todayRow}>
              <Text style={styles.date}>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
              <View style={[styles.badge, { backgroundColor: statusMeta.color }]}>
                <Text style={styles.badgeText}>{statusMeta.label}</Text>
              </View>
            </View>
            <View style={styles.timeRow}>
              <TimeBox label="CHECK IN" value={today?.check_in} />
              <Text style={styles.arrow}>→</Text>
              <TimeBox label="CHECK OUT" value={today?.check_out} />
            </View>
            {today?.minutes != null ? (
              <Text style={styles.minutes}>worked {Math.floor(today.minutes / 60)}h {today.minutes % 60}m</Text>
            ) : null}
            <View style={styles.btnRow}>
              {status === 'absent' ? (
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} disabled={busy} onPress={() => act(api.attendanceCheckIn)} activeOpacity={0.8}>
                  <Text style={styles.btnPrimaryText}>{busy ? '…' : 'CHECK IN'}</Text>
                </TouchableOpacity>
              ) : null}
              {status === 'present' ? (
                <TouchableOpacity style={[styles.btn, styles.btnOut]} disabled={busy} onPress={() => act(api.attendanceCheckOut)} activeOpacity={0.8}>
                  <Text style={styles.btnOutText}>{busy ? '…' : 'CHECK OUT'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {roster ? <RosterCard roster={roster} /> : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionLabel}>HISTORY</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No attendance records yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.rowCard}>
          <Text style={styles.rowDate}>{item.work_date}</Text>
          <Text style={styles.rowTime}>
            {item.check_in ? item.check_in.slice(11, 16) : '—'} → {item.check_out ? item.check_out.slice(11, 16) : '—'}
          </Text>
          <Text style={[styles.rowStatus, { color: item.status === 'absent' ? colors.danger : colors.muted }]}>
            {item.status}
          </Text>
        </View>
      )}
    />
  );
}

function TimeBox({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.timeBox}>
      <Text style={styles.timeValue}>{value ? value.toISOString().slice(11, 16) : '--:--'}</Text>
      <Text style={styles.timeLabel}>{label}</Text>
    </View>
  );
}

function RosterCard({ roster }: { roster: Roster }) {
  const [collapsed, setCollapsed] = useState(false);
  const here = roster.rows.filter((r: RosterRow) => r.attendance?.check_in && !r.attendance?.check_out).length;
  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={() => setCollapsed(!collapsed)} activeOpacity={0.8}>
        <View style={styles.todayRow}>
          <Text style={styles.cardTitle}>Department · {roster.dept ?? '—'}</Text>
          <Text style={styles.cardSub}>{here} on site · {roster.rows.length} staff</Text>
        </View>
      </TouchableOpacity>
      {!collapsed ? (
        <View style={{ marginTop: spacing.sm }}>
          {roster.rows.map((r) => (
            <View key={r.employee_id} style={styles.rosterRow}>
              <Text style={[styles.rosterName, { fontWeight: r.attendance ? '700' : '400' }]}>{r.name}</Text>
              <Text style={styles.rosterMeta}>
                {r.attendance?.check_in ? r.attendance.check_in.slice(11, 16) : 'absent'}
                {r.attendance?.check_out ? ` → ${r.attendance.check_out.slice(11, 16)}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: 16, fontWeight: '700', color: colors.text },
  badge: { borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  timeBox: { alignItems: 'center', flex: 1 },
  timeValue: { fontSize: 30, fontWeight: '700', color: colors.text },
  timeLabel: { color: colors.muted, fontSize: 11, letterSpacing: 1, marginTop: spacing.xs },
  arrow: { color: colors.muted, fontSize: 20, marginHorizontal: spacing.lg },
  minutes: { textAlign: 'center', color: colors.muted, marginTop: spacing.sm, fontSize: 12 },
  btnRow: { marginTop: spacing.lg },
  btn: { borderRadius: 10, paddingVertical: spacing.md, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: '#fff', fontWeight: '700', letterSpacing: 0.5 },
  btnOut: { backgroundColor: colors.okSoft },
  btnOutText: { color: colors.ok, fontWeight: '700', letterSpacing: 0.5 },
  error: { color: colors.danger, marginTop: spacing.md },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  cardSub: { color: colors.muted, fontSize: 12 },
  rosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rosterName: { color: colors.text, fontSize: 14 },
  rosterMeta: { color: colors.muted, fontSize: 13 },
  rowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowDate: { color: colors.text, fontWeight: '600', flex: 1 },
  rowTime: { color: colors.muted, fontSize: 13 },
  rowStatus: { textTransform: 'capitalize', fontSize: 12, fontWeight: '700', marginLeft: spacing.sm },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.lg },
});