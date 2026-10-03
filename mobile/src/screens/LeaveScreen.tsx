import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../api/client';
import type { LeaveBalanceItem, LeaveRequest } from '../api/types';
import { colors, spacing } from '../theme';

const TYPES = [
  { type: 'casual', label: 'Casual' },
  { type: 'sick', label: 'Sick' },
  { type: 'earned', label: 'Earned' },
  { type: 'other', label: 'Other' },
];

const statusColor: Record<string, string> = {
  pending_dept: colors.warn,
  pending_hr: colors.warn,
  approved: colors.ok,
  rejected: colors.danger,
  cancelled: colors.muted,
};

interface Combined extends LeaveRequest {
  _fromMe: boolean;
}

export default function LeaveScreen() {
  const [balances, setBalances] = useState<LeaveBalanceItem[]>([]);
  const [mine, setMine] = useState<LeaveRequest[]>([]);
  const [approvals, setApprovals] = useState<LeaveRequest[]>([]);
  const [combo, setCombo] = useState<Combined[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ type: string; days: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [b, m, a] = await Promise.all([api.leaveBalances(), api.leaveMy(), api.leaveApprovals()]);
      setBalances(b.items);
      setMine(m);
      setApprovals(a);
      setCombo([
        ...m.map((x) => ({ ...x, _fromMe: true })),
        ...a
          .filter((x) => !m.some((y) => y.id === x.id))
          .map((x) => ({ ...x, _fromMe: false })),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leave data');
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

  const decide = useCallback(
    async (id: number, approve: boolean) => {
      setBusy(true);
      try {
        await (approve ? api.leaveApprove(id) : api.leaveReject(id));
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Decision failed');
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const apply = useCallback(async () => {
    if (!form || !form.type || Number(form.days) < 1) return;
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const to = new Date(from);
    to.setDate(to.getDate() + Number(form.days) - 1);
    setBusy(true);
    try {
      await api.leaveApply({
        leave_type: form.type,
        from_date: from.toISOString().slice(0, 10),
        to_date: to.toISOString().slice(0, 10),
        reason: form.reason,
      });
      setForm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setBusy(false);
    }
  }, [form, load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionLabel}>BALANCE</Text>
      <View style={styles.balRow}>
        {balances.map((b) => (
          <View key={b.leave_type} style={styles.balBox}>
            <Text style={styles.balValue}>{b.available}</Text>
            <Text style={styles.balLabel}>{b.leave_type}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.applyBtn}
        disabled={busy}
        onPress={() => setForm(form ? null : { type: 'casual', days: '1', reason: '' })}
        activeOpacity={0.8}
      >
        <Text style={styles.applyText}>{form ? 'CANCEL' : '+ APPLY LEAVE'}</Text>
      </TouchableOpacity>

      {form ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>NEW LEAVE REQUEST</Text>
          <View style={styles.typeRow}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t.type}
                style={[styles.typeChip, form.type === t.type && styles.typeChipActive]}
                onPress={() => setForm({ ...form, type: t.type })}
              >
                <Text style={[styles.typeChipText, form.type === t.type && styles.typeChipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.daysRow}>
            {['1', '2', '3', '5'].map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.typeChip, form.days === d && styles.typeChipActive]}
                onPress={() => setForm({ ...form, days: d })}
              >
                <Text style={[styles.typeChipText, form.days === d && styles.typeChipTextActive]}>{d} day{d === '1' ? '' : 's'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.applyBtn, { backgroundColor: colors.primary, marginBottom: 0 }]}
            disabled={busy}
            onPress={() => apply()}
            activeOpacity={0.8}
          >
            <Text style={[styles.applyText, { color: '#fff' }]}>SUBMIT FOR APPROVAL</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>REQUESTS & APPROVALS</Text>
      {combo.length === 0 ? (
        <Text style={styles.empty}>No leave requests yet.</Text>
      ) : (
        combo.map((r) => (
          <View key={r.id} style={styles.card}>
            <View style={styles.rowTop}>
              <Text style={styles.cardTitle}>
                {r.leave_type} · {r.days} day{r.days === 1 ? '' : 's'}
              </Text>
              <View style={[styles.badge, { backgroundColor: statusColor[r.status] ?? colors.muted }]}>
                <Text style={styles.badgeText}>{r.status.replace('_', ' ').toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.cardBody}>
              {r.from_date} → {r.to_date}
              {r._fromMe ? '' : ` · ${r.employee_name ?? ''}`}
            </Text>
            {r.reason ? <Text style={styles.cardBody}>{r.reason}</Text> : null}
            {!r._fromMe && (r.status === 'pending_dept' || r.status === 'pending_hr') ? (
              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.btn, styles.reject]} disabled={busy} onPress={() => decide(r.id, false)} activeOpacity={0.8}>
                  <Text style={styles.rejectText}>REJECT</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.approve]} disabled={busy} onPress={() => decide(r.id, true)} activeOpacity={0.8}>
                  <Text style={styles.approveText}>APPROVE</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
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
  error: { color: colors.danger, marginBottom: spacing.md },
  balRow: { flexDirection: 'row', gap: spacing.sm },
  balBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  balValue: { fontSize: 20, fontWeight: '700', color: colors.primary },
  balLabel: { color: colors.muted, fontSize: 11, textTransform: 'capitalize', marginTop: 2 },
  applyBtn: {
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  applyText: { color: colors.primary, fontWeight: '700', letterSpacing: 0.5 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  cardBody: { color: colors.muted, marginTop: spacing.xs, fontSize: 13 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.lg },
  typeChip: {
    borderRadius: 16,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  typeChipTextActive: { color: '#fff' },
  btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  btn: { flex: 1, borderRadius: 10, paddingVertical: spacing.md, alignItems: 'center' },
  reject: { backgroundColor: colors.dangerSoft },
  rejectText: { color: colors.danger, fontWeight: '700' },
  approve: { backgroundColor: colors.okSoft },
  approveText: { color: colors.ok, fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.lg },
});