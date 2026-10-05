import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../api/client';
import type { GuestVisit } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { SECURITY_ROLES } from '../auth/permissions';
import { messageOf } from '../auth/session';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  Monogram,
  ScreenSkeleton,
  SectionHeader,
  TextField,
} from '../components/ui';
import { colors, formatDateTime, spacing, typography } from '../theme';

const STATUS_COLOR: Record<string, string> = {
  pending: colors.warn,
  admitted: colors.ok,
  checked_out: colors.muted,
  cancelled: colors.danger,
};

const FILTERS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'admitted', label: 'On site' },
  { key: 'checked_out', label: 'Left' },
];

export default function GuestScreen() {
  const { user, isInRole } = useAuth();
  const isSecurity = isInRole(SECURITY_ROLES);

  const [visits, setVisits] = useState<GuestVisit[]>([]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', purpose: '', host: '' });

  const load = useCallback(async () => {
    try {
      setError(null);
      setVisits(await api.guests(filter));
    } catch (e) {
      setError(messageOf(e, 'Failed to load visitors'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const register = useCallback(async () => {
    if (!form.name.trim()) {
      setError('Visitor name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.guestRegister({
        visitor_name: form.name.trim(),
        phone: form.phone.trim(),
        purpose: form.purpose.trim(),
        host_name: form.host.trim(),
      });
      setForm({ name: '', phone: '', purpose: '', host: '' });
      setShowForm(false);
      await load();
    } catch (e) {
      setError(messageOf(e, 'Could not register the visit'));
    } finally {
      setBusy(false);
    }
  }, [form, load]);

  const act = useCallback(
    async (fn: () => Promise<GuestVisit>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await load();
      } catch (e) {
        setError(messageOf(e, 'Action failed'));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (loading) return <ScreenSkeleton label="Loading visitor log" rows={6} />;

  const pendingCount = visits.filter((v) => v.status === 'pending').length;

  return (
    <View style={styles.screen}>
      <View style={styles.bannerWrap}>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
        <Button
          label={showForm ? 'Cancel' : '+ Register visitor'}
          variant={showForm ? 'secondary' : 'primary'}
          icon={
            <Ionicons
              name={showForm ? 'close' : 'person-add'}
              size={16}
              color={showForm ? colors.text : '#ffffff'}
            />
          }
          onPress={() => setShowForm((s) => !s)}
        />
      </View>

      <FlatList
        data={visits}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={styles.list}
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
        ListHeaderComponent={
          <>
            {showForm ? (
              <Card level={2} style={styles.form}>
                <SectionHeader label="Visitor details" />
                <TextField
                  label="Visitor name"
                  required
                  containerStyle={styles.field}
                  value={form.name}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                  placeholder="Guest or vendor"
                />
                <TextField
                  label="Contact number"
                  containerStyle={styles.field}
                  value={form.phone}
                  onChangeText={(v) => setForm({ ...form, phone: v })}
                  placeholder="Optional"
                  keyboardType="phone-pad"
                />
                <TextField
                  label="Purpose of visit"
                  containerStyle={styles.field}
                  value={form.purpose}
                  onChangeText={(v) => setForm({ ...form, purpose: v })}
                  placeholder="Meeting, delivery, service"
                />
                <TextField
                  label="Host"
                  hint="The employee the visitor has come to see."
                  containerStyle={styles.field}
                  value={form.host}
                  onChangeText={(v) => setForm({ ...form, host: v })}
                  placeholder={user?.employee?.name ?? user?.username ?? 'Your name'}
                />
                <Button label="Register visit" onPress={register} loading={busy} />
              </Card>
            ) : null}

            <View style={styles.filters}>
              {FILTERS.map((f) => (
                <Chip
                  key={f.label}
                  label={f.label}
                  active={filter === f.key}
                  onPress={() => setFilter(f.key)}
                />
              ))}
            </View>

            <SectionHeader label={`${visits.length} visits · ${pendingCount} awaiting gate`} />
            {!isSecurity ? (
              <Text style={styles.scopeNote}>
                You see the visits you registered or host. Security staff clear visitors at the gate.
              </Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <EmptyState title="No visits here" hint="Nothing matches this filter right now." />
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.top}>
              <Monogram label={item.visitor_name} seed={item.visit_no} size={38} />
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.visitor_name}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {item.visit_no}
                  {item.department_name ? ` · ${item.department_name}` : ''}
                </Text>
              </View>
              <Badge
                label={(item.status_label ?? item.status).toUpperCase()}
                color={STATUS_COLOR[item.status] ?? colors.muted}
              />
            </View>

            <View style={styles.details}>
              {item.purpose ? <Text style={styles.detail}>{item.purpose}</Text> : null}
              {item.host_name ? <Text style={styles.detail}>Host · {item.host_name}</Text> : null}
              {item.phone ? <Text style={styles.detail}>{item.phone}</Text> : null}
              <Text style={typography.caption}>Arrived {formatDateTime(item.check_in)}</Text>
              {item.check_out ? (
                <Text style={typography.caption}>Left {formatDateTime(item.check_out)}</Text>
              ) : null}
            </View>

            {isSecurity && item.status === 'pending' ? (
              <Button
                label="Admit at gate"
                variant="success"
                compact
                style={styles.action}
                disabled={busy}
                onPress={() => void act(() => api.guestAdmit(item.id))}
              />
            ) : null}
            {isSecurity && item.status === 'admitted' ? (
              <Button
                label="Check out"
                compact
                style={styles.action}
                disabled={busy}
                onPress={() => void act(() => api.guestCheckout(item.id))}
              />
            ) : null}
            {item.status === 'pending' && !isSecurity ? (
              <Text style={styles.note}>Security staff admit visitors at the gate.</Text>
            ) : null}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  bannerWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  form: { marginBottom: spacing.lg },
  field: { marginBottom: spacing.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  scopeNote: { ...typography.caption, marginBottom: spacing.md, lineHeight: 17 },
  card: { marginBottom: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.body, fontWeight: '700' },
  details: { marginTop: spacing.md, gap: 2 },
  detail: { ...typography.bodyMuted },
  action: { marginTop: spacing.lg },
  note: { ...typography.caption, color: colors.warn, marginTop: spacing.md },
});