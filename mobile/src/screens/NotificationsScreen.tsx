import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../api/client';
import type { Notification } from '../api/types';
import { messageOf } from '../auth/session';
import {
  Chip,
  EmptyState,
  ErrorBanner,
  ListSkeleton,
  PriorityChip,
} from '../components/ui';
import { ripple } from '../motion';
import { colors, priorityColor, radius, spacing, typography, withAlpha } from '../theme';
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
      setError(messageOf(e, 'Failed to load notifications'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
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
      setError(messageOf(e, 'Could not mark as read'));
    }
  }, []);

  const unreadCount = items.filter((n) => !n.read).length;
  const visible = useMemo(
    () => (tab === 'unread' ? items.filter((n) => !n.read) : items),
    [tab, items],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {(['all', 'unread'] as Tab[]).map((t) => (
          <Chip
            key={t}
            label={t === 'all' ? `All (${items.length})` : `Unread (${unreadCount})`}
            accessibilityLabel={
              t === 'all' ? `All notifications, ${items.length}` : `Unread notifications, ${unreadCount}`
            }
            active={tab === t}
            onPress={() => setTab(t)}
          />
        ))}
      </View>

      {error ? (
        <View style={styles.bannerWrap}>
          <ErrorBanner message={error} onRetry={() => void load()} />
        </View>
      ) : null}

      {loading ? (
        <ListSkeleton label="Loading notifications" rows={6} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(n) => String(n.id)}
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
              title={tab === 'unread' ? 'You are all caught up' : 'No notifications'}
              hint={tab === 'unread' ? 'Nothing needs your attention.' : 'Updates will land here.'}
            />
          }
          renderItem={({ item }) => {
            const tone = priorityColor[item.priority] ?? colors.muted;
            return (
              <Pressable
                onPress={() => void markRead(item)}
                style={({ pressed }) => [styles.card, !item.read && styles.cardUnread, pressed && styles.cardPressed]}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                accessibilityHint={item.read ? 'Notification' : 'Unread notification, marks it as read'}
                accessibilityState={{ selected: !item.read }}
                {...ripple(colors.primary)}
              >
                <View style={[styles.rail, { backgroundColor: tone }]} />
                <View style={styles.flex}>
                  <View style={styles.header}>
                    {!item.read ? <View style={styles.dot} /> : null}
                    <Text style={styles.title} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <PriorityChip priority={item.priority} />
                  </View>
                  {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
                  <Text style={typography.caption} numberOfLines={1}>
                    {item.entity_type ? `${item.entity_type.replace(/_/g, ' ')} ${item.entity_ref ?? ''} · ` : ''}
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  tabs: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm },
  bannerWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  list: { padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xxl },
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
  cardUnread: { borderColor: colors.primary, backgroundColor: withAlpha(colors.primary, 0.05) },
  cardPressed: { opacity: 0.75 },
  rail: { width: 3, borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  title: { ...typography.body, fontWeight: '700', flexShrink: 1 },
  body: { ...typography.bodyMuted, marginTop: 4 },
});