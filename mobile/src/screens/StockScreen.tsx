import { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { api } from '../api/client';
import type { LedgerRow, StockRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { messageOf } from '../auth/session';
import {
  AccessDenied,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  ListSkeleton,
  ScreenSkeleton,
  TextField,
} from '../components/ui';
import { ripple } from '../motion';
import { colors, formatDateTime, radius, spacing, touch, typography, withAlpha } from '../theme';

interface History {
  row: StockRow;
  entries: LedgerRow[];
  loading: boolean;
  error: string | null;
}

export default function StockScreen() {
  const { can } = useAuth();
  const canView = can('Inventory', 'view');
  const canAdjust = can('Inventory', 'edit');

  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'short'>('all');
  const [adjust, setAdjust] = useState<StockRow | null>(null);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<History | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const res = await api.inventoryStock();
      setRows(res.items);
    } catch (e) {
      setError(messageOf(e, 'Failed to load stock'));
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

  const openAdjust = useCallback((row: StockRow) => {
    setAdjust(row);
    setDelta('');
    setNote('');
  }, []);

  /** Movement ledger for one item, so an adjustment can be verified after posting. */
  const openHistory = useCallback(async (row: StockRow) => {
    setHistory({ row, entries: [], loading: true, error: null });
    try {
      const res = await api.inventoryLedger(row.item_id);
      setHistory({ row, entries: res.items, loading: false, error: null });
    } catch (e) {
      setHistory({ row, entries: [], loading: false, error: messageOf(e, 'Failed to load history') });
    }
  }, []);

  const post = useCallback(async () => {
    if (!adjust || !delta || Number.isNaN(Number(delta))) return;
    setBusy(true);
    setError(null);
    try {
      await api.inventoryMovement({
        item_code: adjust.code,
        qty_delta: Number(delta),
        note: note.trim() || 'Mobile adjustment',
        trans_type: 'adj',
      });
      setAdjust(null);
      await load();
      // Keep an open history sheet truthful about what it shows.
      if (history?.row.item_id === adjust.item_id) await openHistory(adjust);
    } catch (e) {
      setError(messageOf(e, 'Adjustment failed'));
    } finally {
      setBusy(false);
    }
  }, [adjust, delta, note, load, history, openHistory]);

  if (!canView) return <AccessDenied module="Inventory" />;
  if (loading) return <ScreenSkeleton label="Loading stock" rows={7} />;

  const shortCount = rows.filter((r) => r.below_min).length;
  const visible = tab === 'short' ? rows.filter((r) => r.below_min) : rows;

  return (
    <View style={styles.screen}>
      <View style={styles.summaryRow}>
        <Card style={styles.summaryCard} level={1}>
          <Text style={styles.summaryValue}>{rows.length}</Text>
          <Text style={typography.caption}>items tracked</Text>
        </Card>
        <Card style={[styles.summaryCard, shortCount > 0 && styles.summaryAlert]} level={1}>
          <Text style={[styles.summaryValue, shortCount > 0 && styles.summaryValueAlert]}>
            {shortCount}
          </Text>
          <Text style={typography.caption}>below reorder</Text>
        </Card>
      </View>

      <View style={styles.tabs}>
        <Chip label={`All (${rows.length})`} active={tab === 'all'} onPress={() => setTab('all')} />
        <Chip label={`Short (${shortCount})`} active={tab === 'short'} onPress={() => setTab('short')} />
      </View>

      {error ? (
        <View style={styles.bannerWrap}>
          <ErrorBanner message={error} onRetry={() => void load()} />
        </View>
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(r) => String(r.item_id)}
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
        ListEmptyComponent={
          <EmptyState
            title={tab === 'short' ? 'Nothing below reorder' : 'No stock rows'}
            hint={tab === 'short' ? 'Every tracked item is healthy.' : 'No items are being tracked yet.'}
          />
        }
        renderItem={({ item }) => (
          <Card style={styles.card} level={1}>
            <View style={styles.flex}>
              <Text style={styles.code}>{item.code}</Text>
              <Text style={styles.desc} numberOfLines={1}>
                {item.description}
              </Text>
              <Text style={typography.caption}>
                {item.uom} · reorder at {item.min_qty}
              </Text>
            </View>

            <View style={styles.right}>
              <Text style={[styles.qty, item.below_min && styles.qtyShort]}>{item.on_hand}</Text>
              {item.below_min ? (
                <View style={styles.lowTag}>
                  <Text style={styles.lowTagText}>LOW</Text>
                </View>
              ) : null}
              <View style={styles.actions}>
                <Pressable
                  onPress={() => void openHistory(item)}
                  hitSlop={touch.hitSlop}
                  style={styles.adjustBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Movement history for ${item.code}`}
                  accessibilityHint="Opens the ledger of past stock movements"
                  {...ripple(colors.primary)}
                >
                  <Ionicons name="time-outline" size={14} color={colors.muted} />
                  <Text style={[styles.adjustText, styles.historyText]}>History</Text>
                </Pressable>
                {canAdjust ? (
                  <Pressable
                    onPress={() => openAdjust(item)}
                    hitSlop={touch.hitSlop}
                    style={styles.adjustBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Adjust stock for ${item.code}`}
                    accessibilityHint={`Currently ${item.on_hand} ${item.uom} on hand`}
                    {...ripple(colors.primary)}
                  >
                    <Ionicons name="swap-vertical" size={14} color={colors.primary} />
                    <Text style={styles.adjustText}>Adjust</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </Card>
        )}
      />

      {!canAdjust ? (
        <View style={styles.footer}>
          <Text style={styles.footerText}>Inventory edit rights are needed to post adjustments.</Text>
        </View>
      ) : null}

      <Modal visible={adjust !== null} transparent animationType="fade" onRequestClose={() => setAdjust(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Adjust {adjust?.code}</Text>
            <Text style={styles.sheetSub} numberOfLines={2}>
              {adjust?.description}
            </Text>

            <TextField
              label="Quantity delta"
              hint="Use a plus or minus figure, for example +10 or -2."
              containerStyle={styles.fieldBlock}
              style={styles.sheetInput}
              value={delta}
              onChangeText={setDelta}
              keyboardType="numbers-and-punctuation"
              placeholder="+10 or -2"
              autoFocus
            />

            <TextField
              label="Reason"
              hint="Recorded against this movement so the ledger explains itself later."
              containerStyle={styles.fieldBlock}
              style={styles.sheetInput}
              value={note}
              onChangeText={setNote}
              placeholder="Cycle count, damage, goods receipt"
              multiline
            />

            <View style={styles.sheetRow}>
              <Button
                label="Cancel"
                variant="secondary"
                style={styles.flex}
                onPress={() => setAdjust(null)}
              />
              <Button
                label="Save adjustment"
                style={styles.flex}
                disabled={!delta || Number.isNaN(Number(delta))}
                loading={busy}
                onPress={post}
              />
            </View>
          </View>
        </View>
      </Modal>
    <Modal
        visible={history !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setHistory(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>History · {history?.row.code}</Text>
            <Text style={styles.sheetSub} numberOfLines={2}>
              {history?.row.description} · on hand {history?.row.on_hand} {history?.row.uom}
            </Text>

            {history?.loading ? (
              <ListSkeleton label="Loading movements" rows={6} />
            ) : history?.error ? (
              <ErrorBanner
                message={history.error}
                onRetry={() => history.row && void openHistory(history.row)}
              />
            ) : history && history.entries.length > 0 ? (
              <ScrollView style={styles.historyList} nestedScrollEnabled>
                {history.entries.map((entry) => {
                  const positive = entry.qty_delta >= 0;
                  return (
                    <View key={entry.id} style={styles.historyRow}>
                      <View style={styles.flex}>
                        <Text style={styles.code}>{entry.trans_type}</Text>
                        <Text style={typography.caption} numberOfLines={1}>
                          {formatDateTime(entry.created_at)}
                          {entry.note ? ` · ${entry.note}` : ''}
                        </Text>
                      </View>
                      <Badge
                        label={`${positive ? '+' : ''}${entry.qty_delta}`}
                        color={positive ? colors.ok : colors.danger}
                      />
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <EmptyState title="No movements" hint="Nothing has been posted against this item yet." />
            )}

            <Button
              label="Close"
              variant="secondary"
              style={styles.mt}
              onPress={() => setHistory(null)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  summaryRow: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, paddingBottom: 0 },
  summaryCard: { flex: 1, alignItems: 'flex-start' },
  summaryAlert: { borderColor: colors.danger, backgroundColor: withAlpha(colors.danger, 0.06) },
  summaryValue: { ...typography.title, fontWeight: '800' },
  summaryValueAlert: { color: colors.danger },
  tabs: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm },
  bannerWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  list: { padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xxl },
  card: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  code: { ...typography.body, fontWeight: '700' },
  desc: { ...typography.bodyMuted, marginTop: 1 },
  right: { alignItems: 'flex-end', gap: 4 },
  qty: { ...typography.title, fontWeight: '800', color: colors.text },
  qtyShort: { color: colors.danger },
  lowTag: {
    backgroundColor: withAlpha(colors.danger, 0.12),
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  lowTagText: { fontSize: 9, fontWeight: '800', color: colors.danger, letterSpacing: 0.6 },
  adjustBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  adjustText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  historyText: { color: colors.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  historyList: { maxHeight: 320, marginBottom: spacing.md },
  mt: { marginTop: spacing.sm },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footer: {
    padding: spacing.md,
    backgroundColor: withAlpha(colors.warn, 0.08),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: { ...typography.caption, color: colors.warn, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  sheetTitle: { ...typography.title },
  sheetSub: { ...typography.caption, marginTop: 2, marginBottom: spacing.lg },
  fieldBlock: { marginBottom: spacing.lg },
  sheetInput: { backgroundColor: colors.bgSoft },
  sheetRow: { flexDirection: 'row', gap: spacing.md },
});