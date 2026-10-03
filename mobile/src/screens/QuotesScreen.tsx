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
import type { CatalogProduct, Quote } from '../api/types';
import { colors, spacing } from '../theme';

const statusColor: Record<string, string> = {
  draft: colors.muted,
  confirmed: colors.ok,
  expired: colors.danger,
  converted: colors.primary,
};

export default function QuotesScreen() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ product: CatalogProduct | null; qty: string; customer: string; phone: string; price: string }>({
    product: null,
    qty: '1',
    customer: '',
    phone: '',
    price: '',
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [q, p] = await Promise.all([api.quotes(), api.catalogProducts('')]);
      setQuotes(q.items);
      setProducts(p.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quotes');
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

  const create = useCallback(async () => {
    if (!form.product || !form.customer.trim()) {
      setError('Choose a product and enter the customer name');
      return;
    }
    setBusy(true);
    try {
      await api.createQuote({
        product_id: form.product.id,
        qty: Number(form.qty) || 1,
        customer_name: form.customer,
        customer_phone: form.phone || undefined,
        unit_price: form.price ? Number(form.price) : undefined,
      });
      setShowForm(false);
      setForm({ product: null, qty: '1', customer: '', phone: '', price: '' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create quote');
    } finally {
      setBusy(false);
    }
  }, [form, load]);

  const confirm = useCallback(
    async (id: number) => {
      setBusy(true);
      try {
        await api.confirmQuote(id);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to confirm');
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  return (
    <View style={styles.screen}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.newBtn} onPress={() => setShowForm(!showForm)}>
        <Text style={styles.newText}>{showForm ? 'CLOSE' : '+ NEW QUOTE'}</Text>
      </TouchableOpacity>

      {showForm ? (
        <View style={styles.card}>
          <Text style={styles.label}>PRODUCT</Text>
          {products.slice(0, 10).map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.prod, form.product?.id === p.id && styles.prodActive]}
              onPress={() => setForm({ ...form, product: p })}
            >
              <Text style={styles.prodName} numberOfLines={1}>{p.name} · {p.model_code} · {p.price_raw || `₹${p.price_value}`}</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.label}>CUSTOMER *</Text>
          <TextInput style={styles.input} value={form.customer} onChangeText={(v) => setForm({ ...form, customer: v })} placeholder="Customer name" placeholderTextColor={colors.muted} />
          <Text style={styles.label}>PHONE</Text>
          <TextInput style={styles.input} value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} placeholder="Contact number" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>QTY</Text>
              <TextInput style={styles.input} value={form.qty} onChangeText={(v) => setForm({ ...form, qty: v })} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>UNIT PRICE (OPTIONAL)</Text>
              <TextInput style={styles.input} value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} keyboardType="decimal-pad" placeholder="auto" placeholderTextColor={colors.muted} />
            </View>
          </View>
          <TouchableOpacity style={[styles.newBtn, { backgroundColor: colors.primary }]} disabled={busy} onPress={() => create()}>
            <Text style={[styles.newText, { color: '#fff' }]}>CREATE QUOTE</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={quotes}
          keyExtractor={(q) => String(q.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<Text style={styles.empty}>No quotes yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.top}>
                <Text style={styles.quoteNo}>{item.quote_no}</Text>
                <View style={[styles.statusBox, { backgroundColor: statusColor[item.status] ?? colors.muted }]}>
                  <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.cust}>{item.customer_name}</Text>
              <Text style={styles.meta}>
                {item.product_name} × {item.qty}
                {item.lead_days ? ` · lead ${item.lead_days}d` : ''}
              </Text>
              <Text style={styles.total}>{item.total_raw || `₹${item.total}`}</Text>
              {item.status === 'draft' ? (
                <TouchableOpacity style={[styles.confirmBtn]} disabled={busy} onPress={() => confirm(item.id)}>
                  <Text style={styles.confirmText}>CONFIRM QUOTE</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quoteNo: { fontSize: 15, fontWeight: '700', color: colors.text },
  statusBox: { borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  cust: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  total: { color: colors.primary, fontWeight: '700', fontSize: 17, marginTop: spacing.sm },
  confirmBtn: {
    backgroundColor: colors.okSoft,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  confirmText: { color: colors.ok, fontWeight: '700', letterSpacing: 0.5, fontSize: 12 },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  prod: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  prodActive: { borderColor: colors.primary, borderWidth: 2 },
  prodName: { color: colors.text, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    color: colors.text,
    backgroundColor: '#fff',
  },
  row: { flexDirection: 'row', gap: spacing.md },
  list: { paddingBottom: spacing.xl },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xl },
});