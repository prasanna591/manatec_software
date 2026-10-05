import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../api/client';
import type { CatalogProduct } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { messageOf } from '../auth/session';
import {
  AccessDenied,
  Badge,
  EmptyState,
  ErrorBanner,
  ScreenSkeleton,
} from '../components/ui';
import { ripple } from '../motion';
import {
  colors,
  formatCurrency,
  NOT_SET,
  radius,
  spacing,
  typography,
  withAlpha,
} from '../theme';

export default function CatalogScreen() {
  const { can } = useAuth();
  const canView = can('Catalog', 'view');
  const canCreate = can('Catalog', 'create');

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalogProduct | null>(null);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const res = await api.catalogProducts(q);
      setProducts(res.items);
    } catch (e) {
      setError(messageOf(e, 'Failed to load the catalogue'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q, canView]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const summary = useMemo(() => {
    const priced = products.filter((p) => p.price_value > 0);
    if (!priced.length) return null;
    const avg = priced.reduce((a, p) => a + p.price_value, 0) / priced.length;
    return `${products.length} products · avg ${formatCurrency(avg)}`;
  }, [products]);

  if (!canView) return <AccessDenied module="Catalog" />;
  if (loading) return <ScreenSkeleton label="Loading catalogue" rows={7} />;

  return (
    <View style={styles.screen}>
      <View style={styles.searchWrap}>
        <View style={styles.search}>
          <Ionicons name="search" size={17} color={colors.textLight} />
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Search products, model codes…"
            placeholderTextColor={colors.textLight}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
        </View>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
        {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      </View>

      <FlatList
        data={products}
        keyExtractor={(p) => String(p.id)}
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
        ListEmptyComponent={
          <EmptyState
            title="No products found"
            hint={q ? `Nothing matches “${q}”.` : 'The catalogue is empty.'}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelected(selected?.id === item.id ? null : item)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityState={{ expanded: selected?.id === item.id }}
            accessibilityLabel={item.name}
            accessibilityHint={item.model_code}
            {...ripple(colors.primary)}
          >
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="contain" />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]}>
                <Ionicons name="cube-outline" size={26} color={colors.textLight} />
              </View>
            )}

            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={typography.caption} numberOfLines={1}>
                {[item.model_code, item.category, item.family_name].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.priceRow}>
                <Text style={styles.price}>{item.price_raw || formatCurrency(item.price_value)}</Text>
                {item.status !== 'active' ? <Badge label={item.status.toUpperCase()} color={colors.muted} /> : null}
              </View>

              {selected?.id === item.id ? (
                <View style={styles.detail}>
                  <DetailRow label="Family" value={item.family_name ?? NOT_SET} />
                  <DetailRow label="Category" value={item.category || NOT_SET} />
                  <DetailRow label="Status" value={item.status} />
                  <DetailRow label="Slug" value={item.slug || NOT_SET} />
                </View>
              ) : null}
            </View>
          </Pressable>
        )}
      />

      {!canCreate ? (
        <View style={styles.footer}>
          <Text style={styles.footerText}>Catalogue maintenance rights are required to add products.</Text>
        </View>
      ) : null}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  searchWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },
  summary: { ...typography.caption, paddingHorizontal: spacing.xs },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { backgroundColor: colors.bgSoft, borderColor: colors.borderStrong },
  image: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.bgSoft },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  name: { ...typography.body, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  price: { ...typography.body, color: colors.primary, fontWeight: '800' },
  detail: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  detailLabel: { ...typography.caption },
  detailValue: { ...typography.caption, color: colors.text, fontWeight: '700' },
  footer: {
    padding: spacing.md,
    backgroundColor: withAlpha(colors.warn, 0.08),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: { ...typography.caption, color: colors.warn, textAlign: 'center' },
});