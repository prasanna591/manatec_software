import { useCallback, useState } from 'react';
import { Animated, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { api } from '../api/client';
import type { BuyList, CatalogProduct, PoReceiptLine, PurchaseOrder } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { isSessionExpired } from '../auth/session';
import {
  AccessDenied,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  KeyValue,
  Monogram,
  OptionRow,
  ScreenSkeleton,
  SectionHeader,
  Stepper,
  SuccessBanner,
} from '../components/ui';
import { ripple, usePressFeedback } from '../motion';
import { colors, formatCurrency, formatDate, radius, spacing, typography, withAlpha } from '../theme';

const STATUS_COLOR: Record<string, string> = {
  draft: colors.muted,
  issued: colors.primary,
  partial: colors.warn,
  received: colors.ok,
  completed: colors.ok,
  cancelled: colors.danger,
};

export default function ProcurementScreen() {
  const { can } = useAuth();
  const canView = can('Purchase', 'view');
  const canApprove = can('Purchase', 'approve');
  const canEdit = can('Purchase', 'edit');
  const canCreate = can('Purchase', 'create');

  const [tab, setTab] = useState<'buylist' | 'orders'>('buylist');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [pick, setPick] = useState<CatalogProduct | null>(null);
  const [qty, setQty] = useState('10');
  const [list, setList] = useState<BuyList | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [receiving, setReceiving] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [p, o] = await Promise.all([api.catalogProducts(''), api.purchaseOrders()]);
      setProducts(p.items);
      setOrders(o.items);
    } catch (e) {
      setError(isSessionExpired(e) ? 'Session expired' : (e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canView]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const compute = useCallback(async () => {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      setList(await api.buyList(pick.id, Number(qty) || 1));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [pick, qty]);

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        setOrders((await api.purchaseOrders()).items);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  /**
   * Turns a computed buy-list into draft purchase orders, one per supplier,
   * since a PO carries a single supplier. Rows the planner could not source are
   * reported instead of being silently dropped.
   */
  const raisePurchaseOrders = useCallback(async () => {
    if (!list) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const bySupplier = new Map<number, { name: string; lines: { item_id: number; qty: number; unit_price: number }[] }>();
      let unsourced = 0;
      for (const row of list.rows) {
        if (row.supplier_id === null) {
          unsourced += 1;
          continue;
        }
        const group = bySupplier.get(row.supplier_id) ?? {
          name: row.supplier_name,
          lines: [],
        };
        group.lines.push({
          item_id: row.item_id,
          qty: row.qty_short,
          unit_price: row.unit_cost,
        });
        bySupplier.set(row.supplier_id, group);
      }

      if (bySupplier.size === 0) {
        setError('No buy-list row has a mapped supplier, so no order can be raised.');
        return;
      }

      let raised = 0;
      for (const [supplierId, group] of bySupplier) {
        await api.createPurchaseOrder({
          supplier_id: supplierId,
          lines: group.lines,
          note: `Auto-raised from buy-list for ${list.product_name} x${list.target_qty}`,
        });
        raised += 1;
      }

      setOrders((await api.purchaseOrders()).items);
      setTab('orders');
      setNotice(
        `Raised ${raised} draft ${raised === 1 ? 'order' : 'orders'}` +
          (unsourced ? ` · ${unsourced} row(s) skipped, no supplier mapped` : ''),
      );
      setList(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [list]);

  if (!canView) return <AccessDenied module="Purchase" />;
  if (loading) return <ScreenSkeleton label="Loading procurement" rows={6} />;

  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      tintColor={colors.primary}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    />
  );

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        <Tab label="BUY-LIST" active={tab === 'buylist'} onPress={() => setTab('buylist')} />
        <Tab
          label={`ORDERS · ${orders.length}`}
          active={tab === 'orders'}
          onPress={() => setTab('orders')}
        />
      </View>

      <View style={styles.bannerWrap}>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
        {notice ? <SuccessBanner message={notice} /> : null}
      </View>

      {tab === 'buylist' ? (
        <FlatList
          data={products}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          refreshControl={refresh}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Card level={2} style={styles.builder}>
                <SectionHeader label="1 · Select product" />
                {pick ? (
                  <View style={styles.picked}>
                    <Monogram label={pick.name} seed={pick.id} size={38} />
                    <View style={styles.flex}>
                      <Text style={styles.pickedName} numberOfLines={1}>
                        {pick.name}
                      </Text>
                      <Text style={typography.caption}>
                        {pick.model_code} · {pick.category || 'Uncategorised'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        setPick(null);
                        setList(null);
                      }}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Clear selected product"
                      {...ripple(colors.primary)}
                    >
                      <Ionicons name="close-circle" size={22} color={colors.textLight} />
                    </Pressable>
                  </View>
                ) : (
                  <Text style={typography.bodyMuted}>Scroll below and tap a product.</Text>
                )}

                <SectionHeader label="2 · Quantity" />
                <View style={styles.qtyRow}>
                  {['1', '5', '10', '25', '50'].map((n) => (
                    <Chip
                      key={n}
                      label={n}
                      accessibilityLabel={`Quantity ${n}`}
                      active={qty === n}
                      onPress={() => setQty(n)}
                    />
                  ))}
                </View>

                <Button
                  label="Compute buy-list"
                  icon={<Ionicons name="calculator-outline" size={18} color="#fff" />}
                  onPress={compute}
                  disabled={!pick}
                  loading={busy}
                  style={styles.cta}
                />
              </Card>

              {list ? (
                <BuyListCard list={list} canCreate={canCreate} busy={busy} onRaise={raisePurchaseOrders} />
              ) : null}
              <SectionHeader label="Catalogue" />
            </View>
          }
          ListEmptyComponent={<EmptyState title="No products" hint="Seed the catalogue to plan buys." />}
          renderItem={({ item }) => (
            <OptionRow
              label={item.name}
              sublabel={`${item.model_code} · ${item.category || 'Uncategorised'}`}
              monogram={<Monogram label={item.name} seed={item.id} size={38} />}
              selected={pick?.id === item.id}
              onPress={() => {
                setPick(item);
                setList(null);
              }}
              trailing={<Text style={styles.prodPrice}>{item.price_raw || formatCurrency(item.price_value)}</Text>}
            />
          )}
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={styles.list}
          refreshControl={refresh}
          ListEmptyComponent={<EmptyState title="No purchase orders" hint="Raise one from the buy-list tab." />}
renderItem={({ item }) => {
            const tone = STATUS_COLOR[item.status] ?? colors.muted;
            const open = item.status === 'issued' || item.status === 'partial';
            return (
              <Card style={styles.po}>
                <View style={styles.top}>
                  <Text style={styles.poNo}>{item.po_no}</Text>
                  <Badge label={item.status.toUpperCase()} color={tone} />
                </View>
                <Text style={styles.poSupplier}>{item.supplier_name}</Text>

                <View style={styles.lines}>
                  {item.lines.slice(0, 3).map((l) => (
                    <View key={l.id} style={styles.line}>
                      <Text style={styles.lineCode}>{l.code}</Text>
                      <Text style={styles.lineDesc} numberOfLines={1}>
                        {l.description}
                      </Text>
                      <Text style={styles.lineQty}>
                        {l.received_qty}/{l.qty}
                      </Text>
                    </View>
                  ))}
                  {item.lines.length > 3 ? (
                    <Text style={typography.caption}>+{item.lines.length - 3} more lines</Text>
                  ) : null}
                </View>

                <KeyValue label="Expected" value={formatDate(item.expected_delivery_date)} />
                <KeyValue label="Value" value={formatCurrency(item.total_value)} />

                {item.overdue ? <Badge label="OVERDUE" color={colors.danger} style={styles.spaced} /> : null}

                {item.status === 'draft' && (canApprove || canEdit) ? (
                  <View style={styles.btnRow}>
                    {canEdit ? (
                      <Button
                        label="Cancel"
                        variant="secondary"
                        compact
                        style={styles.flex}
                        disabled={busy}
                        onPress={() => void act(() => api.cancelPurchaseOrder(item.id))}
                      />
                    ) : null}
                    {canApprove ? (
                      <Button
                        label="Issue to supplier"
                        variant="success"
                        compact
                        style={styles.flex}
                        disabled={busy}
                        onPress={() => void act(() => api.issuePurchaseOrder(item.id))}
                      />
                    ) : null}
                  </View>
                ) : null}

                {open && canEdit ? (
                  <View style={styles.btnRow}>
                    <Button
                      label={receiving === item.id ? 'Hide receipt' : 'Receive goods'}
                      variant={receiving === item.id ? 'secondary' : 'primary'}
                      compact
                      style={styles.flex}
                      disabled={busy}
                      onPress={() => setReceiving(receiving === item.id ? null : item.id)}
                    />
                    <Button
                      label="Cancel order"
                      variant="secondary"
                      compact
                      style={styles.flex}
                      disabled={busy}
                      onPress={() => void act(() => api.cancelPurchaseOrder(item.id))}
                    />
                  </View>
                ) : null}

                {receiving === item.id ? (
                  <ReceiveSheet
                    order={item}
                    busy={busy}
                    onCancel={() => setReceiving(null)}
                    onConfirm={async (lines) => {
                      await act(() => api.receivePurchaseOrder(item.id, lines));
                      setReceiving(null);
                    }}
                  />
                ) : null}

                {item.status === 'draft' && !canApprove && !canEdit ? (
                  <Text style={styles.note}>Needs Purchase approve or edit rights to action this order.</Text>
                ) : null}
                {open && !canEdit ? (
                  <Text style={styles.note}>Goods receipt needs Purchase edit rights.</Text>
                ) : null}
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

function BuyListCard({
  list,
  canCreate,
  busy,
  onRaise,
}: {
  list: BuyList;
  canCreate: boolean;
  busy: boolean;
  onRaise: () => Promise<void>;
}) {
  const tone = list.ok_for_target ? colors.ok : colors.warn;
  const raisable = list.rows.filter((r) => r.supplier_id !== null);
  return (
    <Card style={styles.mt} level={2}>
      <View style={styles.top}>
        <Text style={styles.buyTitle} numberOfLines={1}>
          {list.product_name}
        </Text>
        <Badge
          label={list.ok_for_target ? 'COVERED' : 'SHORT'}
          color={tone}
          background={withAlpha(tone, 0.12)}
        />
      </View>
      <Text style={typography.caption}>
        Target {list.target_qty} · longest lead {list.max_lead_days}d
      </Text>

      {list.rows.length === 0 ? (
        <Text style={styles.note}>No shortages. Stock covers the full target.</Text>
      ) : (
        list.rows.map((r) => (
          <View key={r.item_id} style={styles.buyRow}>
            <View style={styles.flex}>
              <Text style={styles.lineCode}>{r.code}</Text>
              <Text style={typography.caption} numberOfLines={1}>
                {r.supplier_name || 'No supplier mapped'} · {r.lead_days_min}-{r.lead_days_max}d
              </Text>
            </View>
            <Text style={styles.buyQty}>+{r.qty_short}</Text>
            <Text style={styles.buyVal}>{formatCurrency(r.value)}</Text>
          </View>
        ))
      )}

      <View style={styles.totalRow}>
        <Text style={typography.bodyMuted}>Shortage value</Text>
        <Text style={styles.totalValue}>{formatCurrency(list.total_value)}</Text>
      </View>

      {canCreate ? (
        <Button
          label={
            raisable.length
              ? `Raise ${new Set(raisable.map((r) => r.supplier_id)).size} draft order${
                  new Set(raisable.map((r) => r.supplier_id)).size === 1 ? '' : 's'
                }`
              : 'No supplier mapped'
          }
          icon={<Ionicons name="cart-outline" size={18} color="#fff" />}
          onPress={() => void onRaise()}
          disabled={!busy && raisable.length === 0}
          loading={busy}
          style={styles.cta}
        />
      ) : (
        <Text style={styles.note}>Purchase create rights are needed to raise orders from this list.</Text>
      )}
    </Card>
  );
}

/**
 * Goods receipt against an issued PO. Every open line is pre-filled with its
 * remaining quantity, because a delivery usually lands complete; the planner
 * can lower a line for a part-delivery.
 */
function ReceiveSheet({
  order,
  busy,
  onCancel,
  onConfirm,
}: {
  order: PurchaseOrder;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (lines: PoReceiptLine[]) => Promise<void>;
}) {
  const openLines = order.lines.filter((l) => l.remaining > 0);
  const [qtys, setQtys] = useState<Record<number, string>>(() =>
    Object.fromEntries(openLines.map((l) => [l.id, String(l.remaining)])),
  );

  const setQty = (lineId: number, raw: string) => {
    const digits = raw.replace(/[^0-9.]/g, '');
    setQtys((prev) => ({ ...prev, [lineId]: digits }));
  };

  const payload = (): PoReceiptLine[] =>
    openLines
      .map((l) => ({ line_id: l.id, qty: Number(qtys[l.id] ?? 0) }))
      .filter((l) => Number.isFinite(l.qty) && l.qty > 0);

  const lines = payload();
  const overReceipt = lines.some((l) => {
    const row = openLines.find((o) => o.id === l.line_id);
    return row ? l.qty > row.remaining : false;
  });

  return (
    <View style={styles.receive}>
      <Text style={styles.receiveTitle}>Goods receipt · {order.po_no}</Text>

      {openLines.length === 0 ? (
        <Text style={styles.note}>Every line on this order is already fully received.</Text>
      ) : (
        openLines.map((l) => (
          <View key={l.id} style={styles.receiveRow}>
            <View style={styles.flex}>
              <Text style={styles.lineCode}>{l.code}</Text>
              <Text style={typography.caption} numberOfLines={1}>
                received {l.received_qty} of {l.qty}
              </Text>
            </View>
            <Stepper
              label={`received quantity for ${l.code}`}
              value={Number(qtys[l.id] ?? 0) || 0}
              onChange={(next) => setQty(l.id, String(next))}
              inputValue={qtys[l.id] ?? ''}
              onChangeInput={(v) => setQty(l.id, v)}
              min={0}
              max={l.remaining}
            />
          </View>
        ))
      )}

      {overReceipt ? (
        <Text style={[styles.note, styles.warnNote]}>
          A quantity is above the remaining balance, so the server will reject it.
        </Text>
      ) : null}

      <View style={styles.btnRow}>
        <Button
          label="Cancel"
          variant="secondary"
          compact
          style={styles.flex}
          disabled={busy}
          onPress={onCancel}
        />
        <Button
          label="Confirm receipt"
          variant="success"
          compact
          style={styles.flex}
          disabled={busy || lines.length === 0 || overReceipt}
          loading={busy}
          onPress={() => void onConfirm(lines)}
        />
      </View>
    </View>
  );
}

/**
 * Equal-width view switcher. Labels stay upper case on screen but are announced
 * in sentence case, because a screen reader spelling out "BUY-LIST" letter by
 * letter is worse than useless on a noisy floor.
 */
function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { onPressIn, onPressOut, animatedStyle } = usePressFeedback();
  const spoken = label.charAt(0) + label.slice(1).toLowerCase();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected: active }}
      {...ripple(active ? '#ffffff' : colors.primary)}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Animated.View style={animatedStyle}>
        <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  tabs: { flexDirection: 'row', padding: spacing.md, paddingBottom: 0, gap: spacing.sm },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 0.6 },
  tabTextActive: { color: '#ffffff' },
  bannerWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  builder: { marginBottom: spacing.sm },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pickedName: { ...typography.section },
  qtyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cta: { marginTop: spacing.lg },
  prodPrice: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  buyTitle: { ...typography.section, flex: 1 },
  buyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  buyQty: { color: colors.danger, fontWeight: '800' },
  buyVal: { color: colors.text, fontWeight: '700', fontSize: 13, minWidth: 66, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalValue: { ...typography.section, color: colors.text },
  po: { marginBottom: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  poNo: { ...typography.section },
  poSupplier: { ...typography.bodyMuted, marginTop: 2 },
  lines: { marginVertical: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  lineCode: { ...typography.caption, color: colors.text, fontWeight: '700', minWidth: 76 },
  lineDesc: { ...typography.caption, flex: 1 },
  lineQty: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  mt: { marginTop: spacing.md },
  spaced: { marginTop: spacing.md },
  receive: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  receiveTitle: { ...typography.section, marginBottom: spacing.sm },
  receiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  warnNote: { color: colors.danger },
  note: { ...typography.caption, color: colors.warn, marginTop: spacing.md, lineHeight: 17 },
});