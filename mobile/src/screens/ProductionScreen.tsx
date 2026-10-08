import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { CatalogProduct, ProductionOrder } from '../api/types';
import {
  useCatalogProducts,
  useCreateProductionOrder,
  useProductionOrders,
  useSetProductionStatus,
} from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { canGrant } from '../auth/permissions';
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
  const { user, can } = useAuth();
  const canView = can('Production', 'view');
  const canCreate = can('Production', 'create');
  const canEdit = can('Production', 'edit');

  // Fetching is gated on the same permission the backend enforces, otherwise a
  // read-only role would hit 403s before the AccessDenied screen ever renders.
  const {
    data: ordersData,
    isLoading: loading,
    isFetching: refreshing,
    error: fetchError,
    refetch: refresh,
  } = useProductionOrders({ enabled: canView });
  const { data: productsData } = useCatalogProducts('', '', { enabled: canView && canCreate });

  const orders = useMemo(() => ordersData?.items ?? [], [ordersData]);
  const products = useMemo(() => productsData?.items ?? [], [productsData]);

  const [pick, setPick] = useState<CatalogProduct | null>(null);
  const [qty, setQty] = useState('10');
  const [showCreate, setShowCreate] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const createOrder = useCreateProductionOrder();
  const busy = createOrder.isPending;

  const plan = useCallback(async () => {
    if (!pick) return;
    setLocalError(null);
    try {
      await createOrder.mutateAsync({ product_id: pick.id, qty: Number(qty) || 1 });
      setShowCreate(false);
      setPick(null);
    } catch (e) {
      setLocalError(messageOf(e, 'Could not create the order'));
    }
  }, [pick, qty, createOrder]);

  const setStatus = useSetProductionStatus({
    onError: (e) => setLocalError(messageOf(e, 'Action failed')),
  });

  // The hooks invalidate the order list on success, so no manual refresh here.
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setLocalError(null);
      try {
        await fn();
      } catch (e) {
        setLocalError(messageOf(e, 'Action failed'));
      }
    },
    [],
  );

  if (!canView) return <AccessDenied module="Production" />;
  if (loading) return <ScreenSkeleton label="Loading production" rows={5} />;

  const errorMessage = localError ?? (fetchError ? messageOf(fetchError) : null);

  return (
    <View style={styles.screen}>
      <View style={styles.bannerWrap}>
        {errorMessage ? (
          <ErrorBanner message={errorMessage} onRetry={() => void refresh()} />
        ) : null}
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
            onRefresh={() => void refresh()}
          />
        }
        ListHeaderComponent={
          showCreate && canCreate ? (
            <Card level={2} style={styles.planner}>
              <SectionHeader label="Select product" />
              <View style={styles.prodList}>
                {products.slice(0, 12).map((p: CatalogProduct) => (
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
        renderItem={({ item }: { item: ProductionOrder }) => {
          const tone = STATUS_COLOR[item.status] ?? colors.muted;
          const stageIdx = STAGES.indexOf(item.status as (typeof STAGES)[number]);
          const pending = item.lines.reduce((a, l) => a + l.pending, 0);
          const allowed = (item.valid_transitions ?? []).filter((t) =>
            canGrant(user, t.required_permission),
          );
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
                  {allowed.map((t) => {
                    const label = t.label ?? STAGE_LABEL[t.target_status] ?? t.target_status;
                    let variant: 'primary' | 'success' | 'danger' | 'secondary' = 'primary';
                    if (t.action === 'cancel') variant = 'danger';
                    else if (t.target_status === 'in_production' || t.target_status === 'dispatched') variant = 'success';
                    else if (t.target_status === 'on_hold') variant = 'secondary';
                    return (
                      <Button
                        key={t.target_status}
                        label={label}
                        variant={variant}
                        compact
                        style={styles.flex}
                        loading={setStatus.isPending && setStatus.variables?.id === item.id}
                        onPress={() => void run(() => setStatus.mutateAsync({ id: item.id, status: t.target_status }))}
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