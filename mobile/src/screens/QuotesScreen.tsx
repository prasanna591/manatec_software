import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../api/client';
import type { CatalogProduct, Quote } from '../api/types';
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
  Monogram,
  OptionRow,
  ScreenSkeleton,
  SectionHeader,
  TextField,
} from '../components/ui';
import { colors, formatCurrency, formatDate, spacing, typography } from '../theme';

const STATUS_COLOR: Record<string, string> = {
  draft: colors.muted,
  confirmed: colors.ok,
  expired: colors.danger,
  converted: colors.primary,
};

export default function QuotesScreen() {
  const { can } = useAuth();
  const canView = can('Quotations', 'view');
  const canCreate = can('Quotations', 'create');
  const canApprove = can('Quotations', 'approve');

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    product: null as CatalogProduct | null,
    qty: '1',
    customer: '',
    phone: '',
    price: '',
  });

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [q, p] = await Promise.all([api.quotes(), api.catalogProducts('')]);
      setQuotes(q.items);
      setProducts(p.items);
    } catch (e) {
      setError(messageOf(e, 'Failed to load quotes'));
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

  const create = useCallback(async () => {
    if (!form.product || !form.customer.trim()) {
      setError('Choose a product and enter the customer name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createQuote({
        product_id: form.product.id,
        qty: Number(form.qty) || 1,
        customer_name: form.customer.trim(),
        customer_phone: form.phone.trim() || undefined,
        unit_price: form.price ? Number(form.price) : null,
      });
      setShowForm(false);
      setForm({ product: null, qty: '1', customer: '', phone: '', price: '' });
      await load();
    } catch (e) {
      setError(messageOf(e, 'Could not create the quote'));
    } finally {
      setBusy(false);
    }
  }, [form, load]);

  const confirm = useCallback(
    async (id: number) => {
      setBusy(true);
      setError(null);
      try {
        await api.confirmQuote(id);
        await load();
      } catch (e) {
        setError(messageOf(e, 'Could not confirm the quote'));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (!canView) return <AccessDenied module="Quotations" />;
  if (loading) return <ScreenSkeleton label="Loading quotations" rows={6} />;

  return (
    <View style={styles.screen}>
      <View style={styles.bannerWrap}>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      </View>

      {canCreate ? (
        <View style={styles.actionBar}>
          <Button
            label={showForm ? 'Close form' : '+ New quote'}
            variant={showForm ? 'secondary' : 'primary'}
            icon={<Ionicons name="add" size={18} color={showForm ? colors.text : '#fff'} />}
            onPress={() => setShowForm((s) => !s)}
          />
        </View>
      ) : null}

      <FlatList
        data={quotes}
        keyExtractor={(q) => String(q.id)}
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
          showForm && canCreate ? (
            <Card level={2} style={styles.form}>
              <SectionHeader label="Product" />
              <View style={styles.prodList}>
                {products.slice(0, 10).map((p) => (
                  <OptionRow
                    key={p.id}
                    label={p.name}
                    sublabel={`${p.model_code} · ${p.price_raw || formatCurrency(p.price_value)}`}
                    monogram={<Monogram label={p.name} seed={p.id} size={30} />}
                    selected={form.product?.id === p.id}
                    onPress={() => setForm({ ...form, product: p })}
                  />
                ))}
              </View>

              <SectionHeader label="Customer" />
              <TextField
                label="Customer name"
                required
                containerStyle={styles.field}
                value={form.customer}
                onChangeText={(v) => setForm({ ...form, customer: v })}
                placeholder="Who asked for the quote"
              />
              <TextField
                label="Contact number"
                containerStyle={styles.field}
                value={form.phone}
                onChangeText={(v) => setForm({ ...form, phone: v })}
                placeholder="Optional"
                keyboardType="phone-pad"
              />

              <SectionHeader label="Quantity & price" />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <TextField
                    label="Quantity"
                    containerStyle={styles.field}
                    value={form.qty}
                    onChangeText={(v) => setForm({ ...form, qty: v })}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.flex}>
                  <TextField
                    label="Unit price"
                    hint="Leave blank to use the catalogue price."
                    containerStyle={styles.field}
                    value={form.price}
                    onChangeText={(v) => setForm({ ...form, price: v })}
                    keyboardType="decimal-pad"
                    placeholder="Auto"
                  />
                </View>
              </View>

              <Button label="Create quote" onPress={create} loading={busy} style={styles.mt} />
            </Card>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            title="No quotes yet"
            hint={canCreate ? 'Create one to price a customer enquiry.' : 'Nothing quoted so far.'}
          />
        }
        renderItem={({ item }) => {
          const tone = STATUS_COLOR[item.status] ?? colors.muted;
          const av = item.availability;
          return (
            <Card style={styles.card}>
              <View style={styles.top}>
                <View style={styles.flex}>
                  <Text style={styles.quoteNo}>{item.quote_no}</Text>
                  <Text style={styles.cust} numberOfLines={1}>
                    {item.customer_name || 'Walk-in'}
                  </Text>
                </View>
                <Badge label={item.status.toUpperCase()} color={tone} />
              </View>

              <Text style={styles.product} numberOfLines={1}>
                {item.product_name} × {item.qty}
              </Text>

              <KeyValue label="Unit price" value={formatCurrency(item.unit_price)} />
              <KeyValue label="Total" value={formatCurrency(item.total_value)} />
              <KeyValue label="Promised" value={formatDate(item.promised_date)} />
              {av ? (
                <KeyValue
                  label="Buildable now"
                  value={`${av.buildable_now} · max lead ${av.max_lead_days}d`}
                />
              ) : null}

              {item.status === 'draft' ? (
                canApprove ? (
                  <Button
                    label="Confirm → production order"
                    compact
                    style={styles.mt}
                    disabled={busy}
                    onPress={() => void confirm(item.id)}
                  />
                ) : (
                  <Text style={styles.note}>Quotation approve rights are needed to confirm.</Text>
                )
              ) : null}
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
  form: { marginBottom: spacing.md },
  field: { flex: 1 },
  prodList: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  mt: { marginTop: spacing.md },
  card: { marginBottom: spacing.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  quoteNo: { ...typography.section },
  cust: { ...typography.bodyMuted, marginTop: 1 },
  product: { ...typography.body, fontWeight: '600', marginBottom: spacing.sm },
  note: { ...typography.caption, color: colors.warn, marginTop: spacing.md },
});