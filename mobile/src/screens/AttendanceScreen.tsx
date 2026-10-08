import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { api } from '../api/client';
import type { AttendanceRow, Roster, RosterRow } from '../api/types';
import { messageOf } from '../auth/session';
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorBanner,
  Monogram,
  ScreenSkeleton,
  SectionHeader,
} from '../components/ui';
import { colors, radius, spacing, typography } from '../theme';

const STATUS_COLOR: Record<AttendanceRow['status'], string> = {
  absent: colors.danger,
  present: colors.ok,
  checked_out: colors.muted,
};

const STATUS_LABEL: Record<AttendanceRow['status'], string> = {
  absent: 'NOT CHECKED IN',
  present: 'ON SITE',
  checked_out: 'CHECKED OUT',
};

/** Backend serializes check_in/check_out as ISO datetime strings. */
function hhmm(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : '--:--';
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

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
        setRoster(null);
      }
    } catch (e) {
      setError(messageOf(e, 'Failed to load attendance'));
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

  const act = useCallback(
    async (fn: () => Promise<AttendanceRow>) => {
      setBusy(true);
      setError(null);
      try {
        setToday(await fn());
        setHistory(await api.attendanceMe());
      } catch (e) {
        setError(messageOf(e, 'Action failed'));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (loading) return <ScreenSkeleton label="Loading attendance" rows={6} />;

  const status = today?.status ?? 'absent';
  const tone = STATUS_COLOR[status];

  return (
    <FlatList<AttendanceRow>
      style={styles.screen}
      data={history}
      keyExtractor={(r) => `${r.work_date}-${r.id ?? 'n'}`}
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
      ListHeaderComponent={
        <View>
          {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

          <SectionHeader label="Today" />
          <Card style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.flex}>
                <Text style={styles.heroDate}>{formatDay(today?.work_date ?? new Date().toISOString())}</Text>
                <Text style={typography.caption}>
                  {today?.minutes != null
                    ? `${Math.floor(today.minutes / 60)}h ${today.minutes % 60}m worked`
                    : 'No hours logged yet'}
                </Text>
              </View>
              <Badge label={STATUS_LABEL[status]} color={tone} />
            </View>

            <View style={styles.timeRow}>
              <TimeBox label="CHECK IN" value={hhmm(today?.check_in)} accent={tone} />
              <Ionicons name="arrow-forward" size={16} color={colors.textLight} />
              <TimeBox label="CHECK OUT" value={hhmm(today?.check_out)} />
            </View>

            {status === 'absent' ? (
              <Button
                label="Check in"
                onPress={() => void act(api.attendanceCheckIn)}
                loading={busy}
                style={styles.heroBtn}
              />
            ) : null}
            {status === 'present' ? (
              <Button
                label="Check out"
                variant="secondary"
                onPress={() => void act(api.attendanceCheckOut)}
                loading={busy}
                style={styles.heroBtn}
              />
            ) : null}
            {status === 'checked_out' ? (
              <Text style={styles.closedNote}>Day closed. See you tomorrow.</Text>
            ) : null}
          </Card>

          {roster ? <RosterCard roster={roster} /> : null}

          <SectionHeader label="History" />
        </View>
      }
      ListEmptyComponent={
        <EmptyState title="No attendance records" hint="Your check-ins will appear here." />
      }
      renderItem={({ item }) => (
        <Card style={styles.rowCard} level={1}>
          <View style={[styles.dot, { backgroundColor: STATUS_COLOR[item.status] }]} />
          <View style={styles.flex}>
            <Text style={styles.rowDate}>{item.work_date}</Text>
            <Text style={typography.caption}>
              {hhmm(item.check_in)} → {hhmm(item.check_out)}
              {item.minutes != null ? ` · ${Math.floor(item.minutes / 60)}h ${item.minutes % 60}m` : ''}
            </Text>
          </View>
          <Text style={[styles.rowStatus, { color: STATUS_COLOR[item.status] }]}>
            {item.status === 'checked_out' ? 'Done' : item.status}
          </Text>
        </Card>
      )}
    />
  );
}

function TimeBox({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={[styles.timeBox, accent && { borderColor: accent }]}>
      <Text style={[styles.timeValue, accent && { color: accent }]}>{value}</Text>
      <Text style={styles.timeLabel}>{label}</Text>
    </View>
  );
}

function RosterCard({ roster }: { roster: Roster }) {
  const [collapsed, setCollapsed] = useState(false);
  const here = roster.rows.filter((r: RosterRow) => r.attendance?.check_in && !r.attendance?.check_out).length;
  return (
    <Card style={styles.rosterCard}>
      <Pressable
        onPress={() => setCollapsed((c) => !c)}
        style={styles.rosterHead}
        accessibilityRole="button"
      >
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>Team roster</Text>
          <Text style={typography.caption}>
            {roster.dept ?? 'All departments'} · {here} on site · {roster.rows.length} staff
          </Text>
        </View>
        <Ionicons
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={18}
          color={colors.textLight}
        />
      </Pressable>

      {!collapsed ? (
        <View style={styles.rosterBody}>
          <Divider />
          {roster.rows.map((r) => (
            <View key={r.employee_id} style={styles.rosterRow}>
              <Monogram label={r.name} seed={r.employee_id} size={32} />
              <View style={styles.flex}>
                <Text style={styles.rosterName}>{r.name}</Text>
                <Text style={typography.caption}>{r.code}</Text>
              </View>
              <Text
                style={[
                  styles.rosterMeta,
                  r.attendance?.check_in && { color: colors.ok, fontWeight: '700' },
                ]}
              >
                {r.attendance?.check_in ? hhmm(r.attendance.check_in) : 'absent'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  hero: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  heroDate: { ...typography.title, color: '#ffffff' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  timeBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  timeValue: { ...typography.title, color: '#ffffff' },
  timeLabel: { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginTop: 4, letterSpacing: 0.8 },
  heroBtn: { marginTop: spacing.xs },
  closedNote: { ...typography.caption, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: spacing.sm },
  rosterCard: { marginTop: spacing.lg },
  rosterHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...typography.section },
  rosterBody: { marginTop: spacing.md },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rosterName: { ...typography.body, fontWeight: '600' },
  rosterMeta: { ...typography.caption, color: colors.muted, fontWeight: '600' },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowDate: { ...typography.body, fontWeight: '600' },
  rowStatus: { ...typography.caption, fontWeight: '700', textTransform: 'capitalize' },
});