import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../api/client';
import type { CatalogProduct, ProductionOrder } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { messageOf } from '../auth/session';
import {
  AccessDenied,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  KeyValue,
  Chip,
  Monogram,
  OptionRow,
  ScreenSkeleton,
  SectionHeader,
} from '../components/ui';
import { colors, formatDate, spacing, typography } from '../theme';

const STAGES = ['draft', 'planned', 'released', 'in_production', 'qc', 'packed', 'dispatched'] as const;

const STATUS_COLOR: Record<string, string> = {
  draft: colors.muted,
  planned: colors.info,
  released: colors.primary,
  in_production: colors.warn,
  qc: colors.violet,
  packed: colors.teal,
  dispatched: colors.ok,
  cancelled: colors.danger,
  on_hold: colors.warn,
};

/** Human readable labels for stages. */
const STAGE_LABEL: Record<string, string> = {
  draft: 'Draft',
  planned: 'Planned',
  released: 'Released',
  in_production: 'In Production',
  qc: 'Quality Check',
  packed: 'Packed',
  dispatched: 'Dispatched',
  cancelled: 'Cancelled',
  on_hold: 'On Hold',
};

export default function ProductionScreen() {
  const { can } = useAuth();
  const canView = can('Production', 'view');
  const canCreate = can('Production', 'create');
  const canEdit = can('Production', 'edit');

  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [pick, setPick] = useState<CatalogProduct | null>(null);
  const [qty, setQty] = useState('10');
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [o, p] = await Promise.all([api.productionOrders(), api.catalogProducts('')]);
      setOrders(o.items);
      setProducts(p.items);
    } catch (e) {
      setError(messageOf(e, 'Failed to load production'));
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

  const refreshList = async () => setOrders((await api.productionOrders()).items);

  const plan = useCallback(async () => {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      await api.createProductionOrder({ product_id: pick.id, qty: Number(qty) || 1 });
      setShowCreate(false);
      setPick(null);
      await refreshList();
    } catch (e) {
      setError(messageOf(e, 'Could not create the order'));
    } finally {
      setBusy(false);
    }
  }, [pick, qty]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await refreshList();
      } catch (e) {
        setError(messageOf(e, 'Action failed'));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (!canView) return <AccessDenied module="Production" />;
  if (loading) return <ScreenSkeleton label="Loading production" rows={5} />;

  return (
    <View style={styles.screen}>
      <View style={styles.bannerWrap}>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      </View>

      {canCreate ? (
        <View style={styles.actionBar}>
          <Button
            label={showCreate ? 'Close planner' : '+ New manufacturing order'}
            variant={showCreate ? 'secondary' : 'primary'}
            icon={<Ionicons name="add" size={18} color={showCreate ? colors.text : '#fff'} />}
            onPress={() => setShowCreate((s) => !s)}
          />
        </View>
      ) : null}

      <FlatList
        data={orders}
        keyExtractor={(o) => String(o.id)}
        contentContainerStyle={styles.list}
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
          showCreate && canCreate ? (
            <Card level={2} style={styles.planner}>
              <SectionHeader label="Select product" />
              <View style={styles.prodList}>
                {products.slice(0, 12).map((p) => (
                  <OptionRow
                    key={p.id}
                    label={p.name}
                    sublabel={p.model_code}
                    monogram={<Monogram label={p.name} seed={p.id} size={32} />}
                    selected={pick?.id === p.id}
                    onPress={() => setPick(p)}
                  />
                ))}
              </View>

              <SectionHeader label="Quantity" />
              <View style={styles.qtyRow}>
                {['1', '5', '10', '25'].map((n) => (
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
                label="Plan manufacturing order"
                onPress={plan}
                disabled={!pick}
                loading={busy}
                style={styles.mt}
              />
            </Card>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            title="No manufacturing orders"
            hint={canCreate ? 'Create one to start the production spine.' : 'Nothing scheduled for you yet.'}
          />
        }
        renderItem={({ item }) => {
          const tone = STATUS_COLOR[item.status] ?? colors.muted;
          const stageIdx = STAGES.indexOf(item.status as (typeof STAGES)[number]);
          const pending = item.lines.reduce((a, l) => a + l.pending, 0);
          const allowed = item.valid_transitions ?? [];
          return (
            <Card style={styles.card}>
              <View style={styles.top}>
                <View style={styles.flex}>
                  <Text style={styles.moNo}>{item.order_no}</Text>
                  <Text style={styles.orderProduct} numberOfLines={1}>
                    {item.product_name} × {item.qty}
                  </Text>
                </View>
                <Badge label={STAGE_LABEL[item.status] ?? item.status} color={tone} />
              </View>

              {stageIdx >= 0 ? (
                <View style={styles.track}>
                  {STAGES.map((s, i) => (
                    <View
                      key={s}
                      style={[
                        styles.trackSeg,
                        { backgroundColor: i <= stageIdx ? tone : colors.border },
                      ]}
                    />
                  ))}
                </View>
              ) : null}

              <KeyValue label="Due" value={formatDate(item.due_date)} />
              <KeyValue
                label="Material pending"
                value={`${pending} ${pending === 1 ? 'unit' : 'units'}`}
              />
              {item.source_quote_no ? <KeyValue label="From quote" value={item.source_quote_no} /> : null}

              {canEdit && allowed.length > 0 ? (
                <View style={styles.btnRow}>
                  {allowed.map((nextStatus) => {
                    const label = STAGE_LABEL[nextStatus] ?? nextStatus;
                    let variant: 'primary' | 'success' | 'danger' | 'secondary' = 'primary';
                    if (nextStatus === 'cancelled') variant = 'danger';
                    else if (nextStatus === 'in_production') variant = 'success';
                    else if (nextStatus === 'dispatched') variant = 'success';
                    else if (nextStatus === 'on_hold') variant = 'secondary';
                    return (
                      <Button
                        key={nextStatus}
                        label={label}
                        variant={variant}
                        compact
                        style={styles.flex}
                        disabled={busy}
                        onPress={() => void run(() => api.setProductionStatus(item.id, nextStatus))}
                      />
                    );
                  })}
                </View>
              ) : canEdit ? (
                <Text style={styles.note}>No valid transitions from this state.</Text>
              ) : (
                <Text style={styles.note}>Production edit rights are needed to move this order.</Text>
              )}
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  bannerWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  actionBar: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  planner: { marginBottom: spacing.md },
  prodList: { gap: spacing.sm },
  qtyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mt: { marginTop: spacing.lg },
  card: { marginBottom: spacing.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  moNo: { ...typography.section },
  orderProduct: { ...typography.bodyMuted, marginTop: 2 },
  track: { flexDirection: 'row', gap: 3, marginVertical: spacing.md },
  trackSeg: { flex: 1, height: 5, borderRadius: 3 },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  note: { ...typography.caption, color: colors.warn, marginTop: spacing.md },
});