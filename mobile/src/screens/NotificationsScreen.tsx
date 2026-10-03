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
import type { Notification } from '../api/types';
import { colors, priorityColor, spacing } from '../theme';
import { setUnread } from '../unread';

type Tab = 'all' | 'unread';

export default function NotificationsScreen() {
  const [items, setItems] = useState<Notification[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const all = await api.notifications(false);
      setItems(all);
      setUnread(all.filter((n) => !n.read).length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications');
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

  const markRead = useCallback(async (n: Notification) => {
    if (n.read) return;
    try {
      await api.markRead(n.id);
      setItems((prev) => {
        const next = prev.map((x) => (x.id === n.id ? { ...x, read: true } : x));
        setUnread(next.filter((x) => !x.read).length);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark as read');
    }
  }, []);

  const visible = tab === 'unread' ? items.filter((n) => !n.read) : items;

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {(['all', 'unread'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'all' ? 'All' : `Unread (${items.filter((n) => !n.read).length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListEmptyComponent={<Text style={styles.empty}>No notifications.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, !item.read && styles.cardUnread]}
              onPress={() => markRead(item)}
              activeOpacity={0.8}
            >
              <View style={styles.header}>
                {!item.read ? <View style={styles.dot} /> : null}
                <Text style={styles.title}>{item.title}</Text>
                <Text
                  style={[styles.priority, { color: priorityColor[item.priority] ?? colors.muted }]}
                >
                  {item.priority}
                </Text>
              </View>
              {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
              <Text style={styles.meta}>
                {item.entity_type ? `${item.entity_type} ${item.entity_ref ?? ''} · ` : ''}
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.muted, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  list: { padding: spacing.md, paddingTop: 0 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xl },
  error: { color: colors.danger, paddingHorizontal: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUnread: { borderColor: colors.primary, backgroundColor: '#f8fbff' },
  header: { flexDirection: 'row', alignItems: 'center' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  priority: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  body: { color: colors.muted, marginTop: spacing.xs },
  meta: { color: colors.muted, fontSize: 11, marginTop: spacing.sm, textTransform: 'capitalize' },
});
