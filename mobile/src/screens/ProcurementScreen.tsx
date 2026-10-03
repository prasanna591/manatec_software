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
import type { BuyList, BuyListRow, CatalogProduct, PurchaseOrder } from '../api/types';
import { colors, spacing } from '../theme';

export default function ProcurementScreen() {
  const [tab, setTab] = useState<'generate' | 'orders'>('generate');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [pick, setPick] = useState<CatalogProduct | null>(null);
  const [qty, setQty] = useState('10');
  const [list, setList] = useState<BuyList | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [p, o] = await Promise.all([api.catalogProducts(''), api.purchaseOrders()]);
      setProducts(p.items);
      setOrders(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load procurement');
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

  const compute = useCallback(async () => {
    if (!pick) return;
    setBusy(true);
    try {
      setList(await api.buyList({ product_id: pick.id, qty: Number(qty) || 1 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compute failed');
    } finally {
      setBusy(false);
    }
  }, [pick, qty]);

  const po = useCallback(
    async (fn: () => Promise<PurchaseOrder>) => {
      setBusy(true);
      try {
        await fn();
        setOrders(await api.purchaseOrders());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Order action failed');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        <Chip label="GENERATE" active={tab === 'generate'} onPress={() => setTab('generate')} />
        <Chip label={`ORDERS (${orders.length})`} active={tab === 'orders'} onPress={() => setTab('orders')} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : tab === 'generate' ? (
        <FlatList
          data={products}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListHeaderComponent={
            <View>
              <Text style={styles.sectionLabel}>1 · SELECT PRODUCT</Text>
              <Text style={styles.sectionLabel}>2 · QUANTITY</Text>
              <View style={styles.qtyRow}>
                {['1', '5', '10', '25', '50'].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.chip, qty === n && styles.chipActive]}
                    onPress={() => setQty(n)}
                  >
                    <Text style={[styles.chipText, qty === n && styles.chipTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.genBtn, (!pick || busy) && { opacity: 0.5 }]}
                disabled={!pick || busy}
                onPress={() => compute()}
              >
                <Text style={styles.genText}>COMPUTE BUY LIST</Text>
              </TouchableOpacity>
              {list ? (
                <View style={styles.card}>
                  <Text style={styles.listTitle}>{list.product?.name}</Text>
                  <Text style={styles.meta}>need {list.qty_needed} {list.product?.uom}</Text>
                  {list.reason ? <Text style={styles.listReason}>why · {list.reason}</Text> : null}
                  {list.items.map((it: BuyListRow) => (
                    <View key={`${it.supplier_id}-${it.source}`} style={styles.line}>
                      <Text style={styles.lineName}>{it.supplier}</Text>
                      <Text style={styles.lineNum}>+{it.qty_to_order}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {pick ? null : <Text style={styles.sectionLabel}>3 · COMPUTE</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.prod, pick?.id === item.id && styles.prodActive]}
              onPress={() => setPick(item)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.prodName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.meta}>{item.model_code} · {item.category ?? '—'} · {item.uom}</Text>
              </View>
              <Text style={styles.prodPrice}>{item.price_raw || `₹${item.price_value}`}</Text>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<Text style={styles.empty}>No purchase orders.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.top}>
                <Text style={styles.poNo}>PO-{item.po_no}</Text>
                <Text style={[styles.status, { color: statusColor[item.status] }]}>{item.status.toUpperCase()}</Text>
              </View>
              <Text style={styles.meta}>{item.supplier}</Text>
              <Text style={styles.meta}>
                {item.product_name} × {item.qty} {item.uom} · due {item.due_date ?? '—'}
              </Text>
              {item.total ? <Text style={styles.poTotal}>{item.total_raw || `₹${item.total}`}</Text> : null}
              {item.status === 'draft' ? (
                <View style={styles.btnRow}>
                  <TouchableOpacity style={[styles.btn, styles.cancelBtn]} disabled={busy} onPress={() => po(() => api.cancelPurchaseOrder(item.id))}>
                    <Text style={styles.cancelText}>CANCEL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.issueBtn]} disabled={busy} onPress={() => po(() => api.issuePurchaseOrder(item.id))}>
                    <Text style={styles.issueText}>ISSUE</Text>
                  </TouchableOpacity>
                </View>
              ) : item.status === 'issued' ? (
                <View style={styles.btnRow}>
                  <TouchableOpacity style={[styles.btn, styles.cancelBtn]} disabled={busy} onPress={() => po(() => api.cancelPurchaseOrder(item.id))}>
                    <Text style={styles.cancelText}>CANCEL ORDER</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const statusColor: Record<string, string> = {
  draft: colors.muted,
  issued: colors.primary,
  completed: colors.ok,
  cancelled: colors.danger,
};

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
  tabs: { flexDirection: 'row', padding: spacing.md, paddingBottom: 0, gap: spacing.sm },
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
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xl },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  qtyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  genBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  genText: { color: '#fff', fontWeight: '700', letterSpacing: 0.5 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  listReason: { color: colors.warn, fontSize: 12, marginTop: 2 },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  lineName: { color: colors.text, flex: 1, fontSize: 14 },
  lineNum: { color: colors.primary, fontWeight: '700' },
  prod: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  prodActive: { borderColor: colors.primary, borderWidth: 2 },
  prodName: { fontSize: 15, fontWeight: '600', color: colors.text },
  prodPrice: { color: colors.primary, fontWeight: '700' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  poNo: { fontSize: 16, fontWeight: '700', color: colors.text },
  status: { fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
  poTotal: { color: colors.text, fontWeight: '700', marginTop: spacing.sm, fontSize: 15 },
  btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  btn: { flex: 1, borderRadius: 8, paddingVertical: spacing.sm, alignItems: 'center' },
  cancelBtn: { backgroundColor: colors.dangerSoft },
  cancelText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  issueBtn: { backgroundColor: colors.okSoft },
  issueText: { color: colors.ok, fontWeight: '700', fontSize: 13 },
});