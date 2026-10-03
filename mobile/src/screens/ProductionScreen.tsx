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
import type { CatalogProduct, ProductionOrder } from '../api/types';
import { colors, spacing } from '../theme';

const statusColor: Record<string, string> = {
  planned: colors.muted,
  released: colors.primary,
  in_production: colors.warn,
  qc: colors.ok,
  packed: colors.ok,
  dispatched: colors.ok,
  cancelled: colors.danger,
};

export default function ProductionScreen() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [pick, setPick] = useState<CatalogProduct | null>(null);
  const [qty, setQty] = useState('1');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [o, p] = await Promise.all([api.productionOrders(), api.catalogProducts('')]);
      setOrders(o.items);
      setProducts(p.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load production');
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

  const plan = useCallback(async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await api.planProduction({ product_id: pick.id, qty: Number(qty) || 1 });
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Planning failed');
    } finally {
      setBusy(false);
    }
  }, [pick, qty, load]);

  const act = useCallback(
    async (fn: () => Promise<ProductionOrder>) => {
      setBusy(true);
      try {
        await fn();
        const o = await api.productionOrders();
        setOrders(o.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const stage = useCallback(
    async (id: number, status: string) => {
      setBusy(true);
      try {
        await api.setProductionStatus(id, status);
        const o = await api.productionOrders();
        setOrders(o.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Status update failed');
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

  return (
    <View style={styles.screen}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.newBtn} onPress={() => setShowCreate(!showCreate)}>
        <Text style={styles.newText}>{showCreate ? 'CLOSE' : '+ NEW MANUFACTURING ORDER'}</Text>
      </TouchableOpacity>

      {showCreate ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>SELECT PRODUCT</Text>
          {products.slice(0, 20).map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.prod, pick?.id === p.id && styles.prodActive]}
              onPress={() => setPick(p)}
            >
              <Text style={styles.prodName} numberOfLines={1}>{p.name} · {p.model_code}</Text>
              <Text style={styles.prodQty}>qty {qty}</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.sectionLabel}>QTY</Text>
          <View style={styles.qtyRow}>
            {['1', '5', '10', '25'].map((n) => (
              <TouchableOpacity key={n} style={[styles.chip, qty === n && styles.chipActive]} onPress={() => setQty(n)}>
                <Text style={[styles.chipText, qty === n && styles.chipTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.newBtn, { backgroundColor: colors.primary, opacity: pick ? 1 : 0.5 }]} disabled={!pick || busy} onPress={() => plan()}>
            <Text style={[styles.newText, { color: '#fff' }]}>PLAN MANUFACTURING</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={orders}
        keyExtractor={(o) => String(o.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Text style={styles.empty}>No manufacturing orders.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.top}>
              <View style={{ flex: 1 }}>
                <Text style={styles.moNo}>{item.mo_no}</Text>
                <Text style={styles.prodName}>{item.product_name} × {item.qty}</Text>
              </View>
              <View style={[styles.statusBox, { backgroundColor: statusColor[item.status] ?? colors.muted }]}>
                <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.meta}>
              due {item.due_date} · priority {item.priority}
              {item.material_status ? ` · material ${item.material_status}` : ''}
            </Text>
            {item.status === 'planned' ? (
              <View style={styles.btnRow}>
                <Btn danger busy={busy} label="CANCEL" onPress={() => stage(item.id, 'cancelled')} />
                <Btn ok busy={busy} label="RELEASE" onPress={() => act(() => api.releaseProductionOrder(item.id))} />
              </View>
            ) : null}
            {item.status === 'released' ? (
              <View style={styles.btnRow}>
                <Btn danger busy={busy} label="CANCEL" onPress={() => stage(item.id, 'cancelled')} />
                <Btn ok busy={busy} label="ISSUE MATERIAL" onPress={() => act(() => api.issueMaterial(item.id))} />
              </View>
            ) : null}
            {item.status === 'in_production' ? (
              <View style={styles.btnRow}>
                <Btn ok busy={busy} label="START QC" onPress={() => stage(item.id, 'qc')} />
              </View>
            ) : null}
            {item.status === 'qc' ? (
              <View style={styles.btnRow}>
                <Btn ok busy={busy} label="PACK" onPress={() => stage(item.id, 'packed')} />
              </View>
            ) : null}
            {item.status === 'packed' ? (
              <View style={styles.btnRow}>
                <Btn ok busy={busy} label="DISPATCH" onPress={() => stage(item.id, 'dispatched')} />
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

function Btn({ label, onPress, danger, ok, busy }: { label: string; onPress: () => void; danger?: boolean; ok?: boolean; busy?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.btn, danger && styles.btnDanger, ok && styles.btnOk]}
      disabled={busy}
      onPress={onPress}
    >
      <Text style={[styles.btnText, danger && styles.btnDangerText, ok && styles.btnOkText]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  error: { color: colors.danger, paddingHorizontal: spacing.md },
  newBtn: {
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  newText: { color: colors.primary, fontWeight: '700', letterSpacing: 0.5, fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  moNo: { fontSize: 15, fontWeight: '700', color: colors.text },
  prodName: { color: colors.text, fontSize: 14, marginTop: 2 },
  statusBox: { borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  meta: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  btn: { flex: 1, borderRadius: 8, paddingVertical: spacing.sm, alignItems: 'center' },
  btnDanger: { backgroundColor: colors.dangerSoft },
  btnOk: { backgroundColor: colors.okSoft },
  btnText: { fontWeight: '700', fontSize: 13 },
  btnDangerText: { color: colors.danger },
  btnOkText: { color: colors.ok },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  prod: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  prodActive: { borderColor: colors.primary, borderWidth: 2 },
  prodQty: { color: colors.primary, fontWeight: '700' },
  qtyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    borderRadius: 16,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  list: { paddingBottom: spacing.xl },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xl },
});