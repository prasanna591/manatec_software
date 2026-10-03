import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../api/client';
import type { CompanyNotice } from '../api/types';
import { colors, spacing } from '../theme';

export default function NoticesScreen() {
  const [notices, setNotices] = useState<CompanyNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setNotices(await api.notices());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load announcements');
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      data={notices}
      keyExtractor={(n) => String(n.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.sectionLabel}>COMPANY · {notices.length} ANNOUNCEMENTS</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No announcements right now.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.bar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{item.title}</Text>
            {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
            <Text style={styles.meta}>
              {new Date(item.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  error: { color: colors.danger, marginBottom: spacing.md },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xl },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bar: { width: 4, borderRadius: 2, backgroundColor: colors.primary, marginRight: spacing.md },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { color: colors.muted, marginTop: spacing.xs, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 11, marginTop: spacing.sm },
});