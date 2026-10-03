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
import type { StockRow } from '../api/types';
import { colors, spacing } from '../theme';

export default function StockScreen() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [alerts, setAlerts] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'short'>('all');
  const [adjust, setAdjust] = useState<StockRow | null>(null);
  const [delta, setDelta] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.inventoryStock();
      setRows(res.items);
      setAlerts(res.alerts.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stock');
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

  const post = useCallback(async () => {
    if (!adjust || !delta) return;
    setBusy(true);
    try {
      await api.inventoryMovement({
        item_code: adjust.code,
        qty_delta: Number(delta),
        note: 'Mobile adjustment',
        trans_type: 'adj',
      });
      setAdjust(null);
      setDelta('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Adjustment failed');
    } finally {
      setBusy(false);
    }
  }, [adjust, delta, load]);

  const visible = tab === 'short' ? rows.filter((r) => r.below_min) : rows;

  return (
    <View style={styles.screen}>
      <View style={styles.summary}>
<Text style={styles.summaryText}>
        {rows.length} items tracked · <Text style={{ color: colors.danger }}>{alerts} below reorder point</Text>
      </Text>
      </View>
      <View style={styles.tabs}>
        <Chip label={`All (${rows.length})`} active={tab === 'all'} onPress={() => setTab('all')} />
        <Chip label={`Short (${rows.filter((r) => r.below_min).length})`} active={tab === 'short'} onPress={() => setTab('short')} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => String(r.item_id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<Text style={styles.empty}>No stock rows.</Text>}
          renderItem={({ item }) => (
            <View style={[styles.card, item.below_min && styles.cardShort]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.code}>{item.code}</Text>
                <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
                <Text style={styles.meta}>
                  {item.uom} · min {item.min_qty}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.qty, item.below_min && styles.qtyShort]}>{item.on_hand}</Text>
                <TouchableOpacity onPress={() => { setAdjust(item); setDelta(''); }} disabled={busy}>
                  <Text style={styles.adjust}>ADJUST</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {adjust ? (
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Adjust {adjust.code}</Text>
          <TextInput
            style={styles.input}
            keyboardType="numbers-and-punctuation"
            value={delta}
            onChangeText={setDelta}
            placeholder="+10 or -2"
            placeholderTextColor={colors.muted}
            autoFocus
          />
          <View style={styles.modalRow}>
            <TouchableOpacity style={[styles.modalBtn, styles.cancel]} onPress={() => setAdjust(null)}>
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, styles.ok]} disabled={busy} onPress={() => post()}>
              <Text style={styles.okText}>SAVE</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summary: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  summaryText: { color: colors.muted, fontSize: 13 },
  tabs: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm },
  chip: {
    borderRadius: 16,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  error: { color: colors.danger, paddingHorizontal: spacing.md },
  list: { paddingHorizontal: spacing.md, paddingTop: 0, paddingBottom: spacing.xl },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xl },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardShort: { borderColor: colors.danger },
  code: { fontSize: 15, fontWeight: '700', color: colors.text },
  desc: { color: colors.muted, fontSize: 13, marginTop: 2 },
  meta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  qty: { fontSize: 22, fontWeight: '700', color: colors.text },
  qtyShort: { color: colors.danger },
  adjust: { color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 4, letterSpacing: 0.5 },
  modal: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  modalTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    color: colors.text,
  },
  modalRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  modalBtn: { flex: 1, borderRadius: 8, paddingVertical: spacing.md, alignItems: 'center' },
  cancel: { backgroundColor: colors.bg },
  ok: { backgroundColor: colors.primary },
  cancelText: { color: colors.muted, fontWeight: '700' },
  okText: { color: '#fff', fontWeight: '700' },
});