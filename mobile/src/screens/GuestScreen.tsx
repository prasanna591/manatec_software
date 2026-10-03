import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../api/client';
import type { GuestVisit } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { colors, spacing } from '../theme';

const SECURITY_ROLES = ['ADMIN', 'MGMT', 'DH', 'HR', 'LOG'];

const statusColor: Record<string, string> = {
  pending: colors.warn,
  admitted: colors.ok,
  checked_out: colors.muted,
  cancelled: colors.danger,
};

export default function GuestScreen() {
  const { user } = useAuth();
  const isSecurity = SECURITY_ROLES.includes(user?.role ?? '');
  const [visits, setVisits] = useState<GuestVisit[]>([]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', purpose: '', host: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setVisits(await api.guests(filter));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load visitors');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const register = useCallback(async () => {
    if (!form.name.trim()) {
      setError('Visitor name is required');
      return;
    }
    setBusy(true);
    try {
      await api.guestRegister({ visitor_name: form.name, phone: form.phone, purpose: form.purpose, host_name: form.host });
      setForm({ name: '', phone: '', purpose: '', host: '' });
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }, [form, load]);

  const act = useCallback(
    async (fn: () => Promise<GuestVisit>) => {
      setBusy(true);
      try {
        await fn();
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed');
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const filters: { key: string | undefined; label: string }[] = [
    { key: undefined, label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'admitted', label: 'On site' },
    { key: 'checked_out', label: 'Left' },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.filters}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.registerBtn} onPress={() => setShowForm(!showForm)}>
          <Text style={styles.registerText}>{showForm ? 'CANCEL' : '+ VISITOR'}</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {showForm ? (
        <View style={styles.formCard}>
          <Text style={styles.formLabel}>VISITOR NAME *</Text>
          <TextInput style={styles.input} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Guest / vendor name" placeholderTextColor={colors.muted} />
          <Text style={styles.formLabel}>PHONE</Text>
          <TextInput style={styles.input} value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} placeholder="Contact number" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
          <Text style={styles.formLabel}>PURPOSE</Text>
          <TextInput style={styles.input} value={form.purpose} onChangeText={(v) => setForm({ ...form, purpose: v })} placeholder="Meeting / delivery / service" placeholderTextColor={colors.muted} />
          <Text style={styles.formLabel}>HOST (YOUR NAME)</Text>
          <TextInput style={styles.input} value={form.host} onChangeText={(v) => setForm({ ...form, host: v })} placeholder={user?.employee?.name ?? user?.username} placeholderTextColor={colors.muted} />
          <TouchableOpacity style={[styles.registerBtn, { backgroundColor: colors.primary, alignSelf: 'stretch', justifyContent: 'center' }]} disabled={busy} onPress={() => register()} activeOpacity={0.8}>
            <Text style={[styles.registerText, { color: '#fff' }]}>REGISTER VISIT</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visits}
          keyExtractor={(v) => String(v.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<Text style={styles.empty}>No visits here.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.top}>
                <Text style={styles.name}>{item.visitor_name}</Text>
                <View style={[styles.badge, { backgroundColor: statusColor[item.status] ?? colors.muted }]}>
                  <Text style={styles.badgeText}>{item.status_label?.toUpperCase()}</Text>
                </View>
              </View>
              {item.phone ? <Text style={styles.body}>{item.phone}</Text> : null}
              {item.purpose ? <Text style={styles.body}>{item.purpose}</Text> : null}
              <Text style={styles.meta}>
                {item.host_name ? `host ${item.host_name}` : ''}
                {item.department_name ? ` · ${item.department_name}` : ''} · {item.visit_no}
              </Text>
              {isSecurity && item.status === 'pending' ? (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.ok }]} disabled={busy} onPress={() => act(() => api.guestAdmit(item.id))} activeOpacity={0.8}>
                  <Text style={styles.actionText}>ADMIT</Text>
                </TouchableOpacity>
              ) : null}
              {isSecurity && item.status === 'admitted' ? (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} disabled={busy} onPress={() => act(() => api.guestCheckout(item.id))} activeOpacity={0.8}>
                  <Text style={styles.actionText}>CHECK OUT</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.md, gap: spacing.sm, alignItems: 'center' },
  filterChip: {
    borderRadius: 16,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  filterTextActive: { color: '#fff' },
  registerBtn: {
    marginLeft: 'auto',
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
  },
  registerText: { color: colors.primary, fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
  error: { color: colors.danger, paddingHorizontal: spacing.md },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginTop: spacing.xs,
    color: colors.text,
    backgroundColor: '#fff',
  },
  list: { padding: spacing.md, paddingTop: 0 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  body: { color: colors.muted, marginTop: 2, fontSize: 14 },
  meta: { color: colors.muted, fontSize: 11, marginTop: spacing.sm },
  actionBtn: { borderRadius: 8, paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.lg },
  actionText: { color: '#fff', fontWeight: '700', letterSpacing: 0.5, fontSize: 12 },
});