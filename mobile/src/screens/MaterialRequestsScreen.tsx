import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../api/client';
import type { MaterialRequest } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { messageOf } from '../auth/session';
import {
  AccessDenied,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorBanner,
  ListSkeleton,
  PriorityChip,
  SectionHeader,
  SuccessBanner,
  TextField,
} from '../components/ui';
import { colors, formatDate, spacing, typography } from '../theme';

const STATUS_COLOR: Record<string, string> = {
  open: colors.warn,
  partial: colors.info,
  fulfilled: colors.ok,
  cancelled: colors.muted,
};

const PRIORITIES = ['routine', 'urgent'] as const;

interface DraftLine {
  item: string;
  qty: string;
}

export default function MaterialRequestsScreen() {
  const { can } = useAuth();
  const mayView = can('MaterialReq', 'view');
  const mayCreate = can('MaterialReq', 'create');
  const mayFulfil = can('MaterialReq', 'edit');

  const [rows, setRows] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!mayView) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setRows(await api.materialRequests());
    } catch (e) {
      setError(messageOf(e, 'Failed to load material requests'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mayView]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const act = useCallback(
    async (id: number, fn: () => Promise<unknown>, done: string) => {
      setBusyId(id);
      setError(null);
      try {
        await fn();
        setFlash(done);
        await load();
      } catch (e) {
        setError(messageOf(e, 'Action failed'));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  if (!mayView) return <AccessDenied module="Material Requests" action="view" />;
  if (loading) return <ListSkeleton rows={4} label="Loading material requests" />;

  const open = rows.filter((r) => r.status === 'open' || r.status === 'partial');
  const closed = rows.filter((r) => r.status === 'fulfilled' || r.status === 'cancelled');

  return (
    <View style={styles.screen}>
      <View style={styles.bannerWrap}>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
        {flash ? <SuccessBanner message={flash} /> : null}
      </View>

      <FlatList
        data={open}
        keyExtractor={(r) => String(r.id)}
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
          <>
            {mayCreate ? (
              <Button
                label={showForm ? 'Close the form' : '+ Request material'}
                variant={showForm ? 'secondary' : 'primary'}
                compact
                style={styles.raise}
                icon={
                  <Ionicons
                    name={showForm ? 'close' : 'add-circle'}
                    size={16}
                    color={showForm ? colors.text : '#ffffff'}
                  />
                }
                onPress={() => setShowForm((s) => !s)}
              />
            ) : null}

            {showForm && mayCreate ? (
              <NewRequest
                onDone={async (reqNo) => {
                  setShowForm(false);
                  setFlash(`${reqNo} raised`);
                  await load();
                }}
                onError={setError}
              />
            ) : null}

            <SectionHeader label={`${open.length} open request${open.length === 1 ? '' : 's'}`} />
          </>
        }
        ListEmptyComponent={
          <EmptyState
            title="Nothing outstanding"
            hint={mayCreate ? 'Raise a request and stores will see it immediately.' : 'Stores has nothing to issue.'}
          />
        }
        renderItem={({ item }) => (
          <RequestCard
            request={item}
            mayFulfil={mayFulfil}
            busy={busyId === item.id}
            onFulfil={() =>
              void act(item.id, () => api.fulfilMaterialRequest(item.id), `${item.req_no} fulfilled`)
            }
            onCancel={() =>
              void act(item.id, () => api.cancelMaterialRequest(item.id), `${item.req_no} cancelled`)
            }
          />
        )}
        ListFooterComponent={
          closed.length > 0 ? (
            <View style={styles.footer}>
              <SectionHeader label="Closed" />
              {closed.map((r) => (
                <Card key={r.id} style={styles.card}>
                  <View style={styles.top}>
                    <View style={styles.flex}>
                      <Text style={styles.name}>{r.req_no}</Text>
                      <Text style={typography.caption} numberOfLines={1}>
                        {r.requester} · {r.lines.length} line{r.lines.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Badge
                      label={r.status.toUpperCase()}
                      color={STATUS_COLOR[r.status] ?? colors.muted}
                    />
                  </View>
                </Card>
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}

function RequestCard({
  request,
  mayFulfil,
  busy,
  onFulfil,
  onCancel,
}: {
  request: MaterialRequest;
  mayFulfil: boolean;
  busy: boolean;
  onFulfil: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.name}>{request.req_no}</Text>
          <Text style={typography.caption} numberOfLines={1}>
            {request.requester}
            {request.purpose_ref ? ` · ${request.purpose_ref}` : ''}
          </Text>
        </View>
        <Badge
          label={request.status.toUpperCase()}
          color={STATUS_COLOR[request.status] ?? colors.muted}
        />
      </View>

      <View style={styles.facts}>
        <PriorityChip priority={request.priority} />
        <Text style={typography.caption}>Required {formatDate(request.required_date)}</Text>
      </View>

      <Button
        label={open ? 'Hide lines' : `${request.lines.length} line${request.lines.length === 1 ? '' : 's'}`}
        variant="secondary"
        compact
        style={styles.expandBtn}
        onPress={() => setOpen((o) => !o)}
      />

      {open ? (
        <View style={styles.expanded}>
          <Divider />
          {request.lines.map((l, index) => (
            <View key={`${l.item}-${index}`} style={styles.line}>
              <Text style={styles.lineItem} numberOfLines={2}>
                {l.item}
              </Text>
              <Text style={styles.lineQty}>
                {l.issued_qty ?? 0}/{l.qty}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {mayFulfil ? (
        <View style={styles.actions}>
          <Button
            label="Fulfil from stores"
            compact
            loading={busy}
            onPress={onFulfil}
            style={styles.actionBtn}
          />
          <Button
            label="Cancel"
            variant="secondary"
            compact
            disabled={busy}
            onPress={onCancel}
            style={styles.actionBtn}
          />
        </View>
      ) : null}
    </Card>
  );
}

function NewRequest({
  onDone,
  onError,
}: {
  onDone: (reqNo: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [purposeRef, setPurposeRef] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('routine');
  const [requiredDate, setRequiredDate] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ item: '', qty: '1' }]);
  const [busy, setBusy] = useState(false);

  const update = useCallback((index: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }, []);

  const submit = useCallback(async () => {
    const parsed = lines
      .map((l) => ({ item: l.item.trim(), qty: Number(l.qty) || 0 }))
      .filter((l) => l.item && l.qty > 0);
    if (parsed.length === 0) {
      onError('Add at least one item with a quantity.');
      return;
    }
    setBusy(true);
    try {
      const created = await api.createMaterialRequest({
        purpose_ref: purposeRef.trim(),
        priority,
        required_date: requiredDate || null,
        lines: parsed,
      });
      setLines([{ item: '', qty: '1' }]);
      await onDone(created.req_no);
    } catch (e) {
      onError(messageOf(e, 'Could not raise the request'));
    } finally {
      setBusy(false);
    }
  }, [lines, onDone, onError, priority, purposeRef, requiredDate]);

  return (
    <Card level={2} style={styles.form}>
      <SectionHeader label="Request material" />
      <TextField
        label="Against"
        hint="Work order, production order or job this is needed for."
        value={purposeRef}
        onChangeText={setPurposeRef}
        placeholder="WO-22 / PO00011"
        containerStyle={styles.field}
      />
      <View style={styles.filters}>
        {PRIORITIES.map((p) => (
          <Chip
            key={p}
            label={p === 'routine' ? 'Routine' : 'Urgent'}
            active={priority === p}
            onPress={() => setPriority(p)}
          />
        ))}
      </View>
      <TextField
        label="Required by"
        value={requiredDate}
        onChangeText={setRequiredDate}
        placeholder="YYYY-MM-DD"
        containerStyle={styles.field}
      />

      <SectionHeader label="Items" />
      {lines.map((l, index) => (
        <View key={index} style={styles.lineEditor}>
          <TextField
            label={index === 0 ? 'Item' : undefined}
            required={index === 0}
            accessibilityLabel={index === 0 ? 'Item' : `Item ${index + 1}`}
            value={l.item}
            onChangeText={(v) => update(index, { item: v })}
            placeholder="Bearing 6205 2RS"
            containerStyle={styles.lineItemField}
          />
          <TextField
            label={index === 0 ? 'Qty' : undefined}
            accessibilityLabel={index === 0 ? 'Quantity' : `Quantity ${index + 1}`}
            value={l.qty}
            onChangeText={(v) => update(index, { qty: v })}
            keyboardType="numeric"
            containerStyle={styles.lineQtyField}
          />
          {lines.length > 1 ? (
            <Button
              label="Remove"
              variant="ghost"
              compact
              onPress={() => setLines((prev) => prev.filter((_, i) => i !== index))}
              style={styles.removeBtn}
            />
          ) : null}
        </View>
      ))}
      <Button
        label="Add another item"
        variant="secondary"
        compact
        onPress={() => setLines((prev) => [...prev, { item: '', qty: '1' }])}
      />
      <Button label="Raise request" loading={busy} onPress={submit} style={styles.submit} />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  bannerWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  raise: { alignSelf: 'flex-start', marginBottom: spacing.md },
  footer: { marginTop: spacing.lg },
  card: { marginBottom: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.body, fontWeight: '700' },
  facts: { marginTop: spacing.md, gap: spacing.sm },
  expandBtn: { marginTop: spacing.lg },
  expanded: { gap: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  lineItem: { ...typography.body, flex: 1 },
  lineQty: { ...typography.amount },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  actionBtn: { flex: 1 },
  form: { marginBottom: spacing.lg, gap: spacing.md },
  field: { marginBottom: spacing.sm },
  filters: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  lineEditor: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  lineItemField: { flex: 3 },
  lineQtyField: { flex: 1 },
  removeBtn: { marginTop: 26 },
  submit: { marginTop: spacing.sm },
});