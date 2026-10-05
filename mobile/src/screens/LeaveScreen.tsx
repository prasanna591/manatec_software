import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../api/client';
import type { LeaveBalanceItem, LeaveRequest } from '../api/types';
import { messageOf } from '../auth/session';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Chip,
  ScreenSkeleton,
  SectionHeader,
  TextField,
} from '../components/ui';
import { colors, spacing, typography } from '../theme';

const TYPES = [
  { type: 'casual', label: 'Casual' },
  { type: 'sick', label: 'Sick' },
  { type: 'earned', label: 'Earned' },
  { type: 'other', label: 'Other' },
];

const STATUS_COLOR: Record<string, string> = {
  pending_dept: colors.warn,
  pending_hr: colors.warn,
  approved: colors.ok,
  rejected: colors.danger,
  cancelled: colors.muted,
};

const STATUS_LABEL: Record<string, string> = {
  pending_dept: 'PENDING DEPT',
  pending_hr: 'PENDING HR',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  cancelled: 'CANCELLED',
};

interface Form {
  type: string;
  days: string;
  reason: string;
}

/** Leave is booked against the next cycle starting on the 1st. */
function cycleRange(days: number): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const to = new Date(from);
  to.setDate(to.getDate() + days - 1);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: iso(from), to: iso(to) };
}

export default function LeaveScreen() {
  const [balances, setBalances] = useState<LeaveBalanceItem[]>([]);
  const [mine, setMine] = useState<LeaveRequest[]>([]);
  const [approvals, setApprovals] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [b, m, a] = await Promise.all([api.leaveBalances(), api.leaveMy(), api.leaveApprovals()]);
      setBalances(b.items);
      setMine(m);
      setApprovals(a);
    } catch (e) {
      setError(messageOf(e, 'Failed to load leave data'));
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

  const decide = useCallback(
    async (id: number, approve: boolean) => {
      setBusy(true);
      setError(null);
      try {
        await (approve ? api.leaveApprove(id) : api.leaveReject(id));
        await load();
      } catch (e) {
        setError(messageOf(e, 'Could not record the decision'));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const apply = useCallback(async () => {
    if (!form) return;
    const days = Number(form.days);
    if (!form.type || days < 1) return;
    const { from, to } = cycleRange(days);
    setBusy(true);
    setError(null);
    try {
      await api.leaveApply({ leave_type: form.type, from_date: from, to_date: to, reason: form.reason });
      setForm(null);
      await load();
    } catch (e) {
      setError(messageOf(e, 'Could not submit the request'));
    } finally {
      setBusy(false);
    }
  }, [form, load]);

  const range = useMemo(() => cycleRange(Number(form?.days ?? 1)), [form?.days]);

  if (loading) return <ScreenSkeleton label="Loading leave" tiles={3} rows={4} />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
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
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      <View style={styles.balRow}>
        {balances.map((b) => (
          <Card key={b.leave_type} style={styles.balBox} level={1}>
            <Text style={[styles.balValue, b.available <= 0 && styles.balEmpty]}>{b.available}</Text>
            <Text style={styles.balLabel}>{b.leave_type}</Text>
            <Text style={styles.balMeta}>of {b.allocated}</Text>
          </Card>
        ))}
      </View>

      <Button
        label={form ? 'Cancel request' : '+ Apply for leave'}
        variant={form ? 'secondary' : 'primary'}
        icon={
          <Ionicons
            name={form ? 'close' : 'calendar'}
            size={17}
            color={form ? colors.text : '#ffffff'}
          />
        }
        onPress={() => setForm(form ? null : { type: 'casual', days: '1', reason: '' })}
        style={styles.cta}
      />

      {form ? (
        <Card level={2} style={styles.form}>
          <SectionHeader label="Leave type" />
          <View style={styles.chipRow}>
            {TYPES.map((t) => (
              <Chip
                key={t.type}
                label={t.label}
                active={form.type === t.type}
                onPress={() => setForm({ ...form, type: t.type })}
              />
            ))}
          </View>

          <SectionHeader label="Days" />
          <View style={styles.chipRow}>
            {['1', '2', '3', '5'].map((d) => (
              <Chip
                key={d}
                label={`${d} day${d === '1' ? '' : 's'}`}
                accessibilityLabel={`${d} ${d === '1' ? 'day' : 'days'}`}
                active={form.days === d}
                onPress={() => setForm({ ...form, days: d })}
              />
            ))}
          </View>

          <SectionHeader label="Reason" />
          <TextField
            label="Reason for leave"
            hint="Your approver sees this with the request."
            containerStyle={styles.fieldBlock}
            style={styles.reasonInput}
            value={form.reason}
            onChangeText={(v) => setForm({ ...form, reason: v })}
            placeholder="Why do you need this leave?"
            multiline
          />

          <Text style={styles.rangeNote}>
            {range.from} → {range.to}
          </Text>
          <Button label="Submit for approval" onPress={apply} loading={busy} />
        </Card>
      ) : null}

      {approvals.length > 0 ? (
        <>
          <SectionHeader label={`Awaiting your approval (${approvals.length})`} />
          {approvals.map((r) => (
            <LeaveCard key={r.id} request={r}>
              <View style={styles.btnRow}>
                <Button
                  label="Reject"
                  variant="danger"
                  compact
                  style={styles.flex}
                  disabled={busy}
                  onPress={() => void decide(r.id, false)}
                />
                <Button
                  label="Approve"
                  variant="success"
                  compact
                  style={styles.flex}
                  disabled={busy}
                  onPress={() => void decide(r.id, true)}
                />
              </View>
            </LeaveCard>
          ))}
        </>
      ) : null}

      <SectionHeader label={approvals.length > 0 ? 'My requests' : 'My requests & approvals'} />
      {mine.length === 0 ? (
        <EmptyState title="No leave requests" hint="Apply above to book time off." />
      ) : (
        mine.map((r) => <LeaveCard key={r.id} request={r} />)
      )}
    </ScrollView>
  );
}

function LeaveCard({ request, children }: { request: LeaveRequest; children?: React.ReactNode }) {
  const tone = STATUS_COLOR[request.status] ?? colors.muted;
  return (
    <Card style={styles.card}>
      <View style={styles.rowTop}>
        <Text style={styles.cardTitle}>
          {request.employee_name ?? 'You'} · {request.leave_type}
        </Text>
        <Badge label={STATUS_LABEL[request.status] ?? request.status} color={tone} />
      </View>
      <Text style={styles.cardBody}>
        {request.from_date} → {request.to_date} · {request.days} day
        {request.days === 1 ? '' : 's'}
      </Text>
      {request.reason ? <Text style={styles.reason}>{request.reason}</Text> : null}
      {request.decided_note ? <Text style={styles.note}>Note: {request.decided_note}</Text> : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  balRow: { flexDirection: 'row', gap: spacing.sm },
  balBox: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  balValue: { ...typography.title, color: colors.primary, fontWeight: '800' },
  balEmpty: { color: colors.danger },
  balLabel: { ...typography.caption, textTransform: 'capitalize', marginTop: 2, fontWeight: '700' },
  balMeta: { ...typography.caption, fontSize: 10 },
  cta: { marginTop: spacing.lg },
  form: { marginTop: spacing.md },
  fieldBlock: { marginBottom: spacing.md },
  reasonInput: { backgroundColor: colors.bgSoft },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  rangeNote: { ...typography.caption, marginBottom: spacing.md },
  card: { marginBottom: spacing.md },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...typography.body, fontWeight: '700', flex: 1, textTransform: 'capitalize' },
  cardBody: { ...typography.bodyMuted, marginTop: 4 },
  reason: { ...typography.bodyMuted, marginTop: spacing.sm, fontStyle: 'italic' },
  note: { ...typography.caption, marginTop: 6 },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
});