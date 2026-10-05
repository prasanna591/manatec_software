import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../api/client';
import type { Task, TaskStatus } from '../api/types';
import { messageOf } from '../auth/session';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  PriorityChip,
  ScreenSkeleton,
} from '../components/ui';
import { colors, formatDate, spacing, typography } from '../theme';

type Filter = 'active' | 'all' | 'done';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Done' },
];

const STATUS_TONE: Record<TaskStatus, string> = {
  open: colors.muted,
  in_progress: colors.info,
  done: colors.ok,
  cancelled: colors.danger,
};

function dueMeta(due: string | null): { text: string; overdue: boolean } {
  if (!due) return { text: 'No due date', overdue: false };
  const d = new Date(due);
  const today = new Date();
  const overdue = d.getTime() < today.getTime() && d.toDateString() !== today.toDateString();
  return { text: `${overdue ? 'Overdue' : 'Due'} ${formatDate(due)}`, overdue };
}

export default function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setTasks(await api.myTasks());
    } catch (e) {
      setError(messageOf(e, 'Failed to load tasks'));
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

  const changeStatus = useCallback(async (task: Task, status: TaskStatus) => {
    setBusyId(task.id);
    setError(null);
    try {
      const updated = await api.setTaskStatus(task.id, status);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) {
      setError(messageOf(e, 'Could not update the task'));
    } finally {
      setBusyId(null);
    }
  }, []);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      active: tasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
      done: tasks.filter((t) => t.status === 'done').length,
    }),
    [tasks],
  );

  const visible = useMemo(() => {
    if (filter === 'active') return tasks.filter((t) => t.status === 'open' || t.status === 'in_progress');
    if (filter === 'done') return tasks.filter((t) => t.status === 'done');
    return tasks;
  }, [tasks, filter]);

  if (loading) return <ScreenSkeleton label="Loading your tasks" rows={5} />;

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={`${f.label} (${counts[f.key]})`}
            accessibilityLabel={`${f.label}, ${counts[f.key]} tasks`}
            active={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </View>

      {error ? (
        <View style={styles.bannerWrap}>
          <ErrorBanner message={error} onRetry={() => void load()} />
        </View>
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(t) => String(t.id)}
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
            title="No tasks here"
            hint={filter === 'active' ? 'Nothing outstanding. Enjoy the calm.' : 'Nothing in this view yet.'}
          />
        }
        renderItem={({ item }) => {
          const due = dueMeta(item.due_date);
          return (
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={styles.badges}>
                  <PriorityChip priority={item.priority} />
                  <Badge label={item.status.replace('_', ' ')} color={STATUS_TONE[item.status]} />
                </View>
              </View>

              {item.description ? (
                <Text style={styles.body} numberOfLines={3}>
                  {item.description}
                </Text>
              ) : null}

              <View style={styles.metaRow}>
                <Text style={styles.meta}>{item.type.replace(/_/g, ' ')}</Text>
                {item.source_ref ? (
                  <>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.meta}>{item.source_ref}</Text>
                  </>
                ) : null}
                <Text style={styles.metaDot}>·</Text>
                <Text style={[styles.meta, due.overdue && styles.overdue]}>{due.text}</Text>
              </View>

              <View style={styles.actions}>
                {item.status !== 'in_progress' && item.status !== 'done' ? (
                  <Button
                    label="Start"
                    variant="secondary"
                    compact
                    style={styles.flex}
                    disabled={busyId === item.id}
                    onPress={() => void changeStatus(item, 'in_progress')}
                  />
                ) : null}
                {item.status !== 'done' ? (
                  <Button
                    label="Complete"
                    compact
                    style={styles.flex}
                    disabled={busyId === item.id}
                    onPress={() => void changeStatus(item, 'done')}
                  />
                ) : (
                  <Button
                    label="Reopen"
                    variant="secondary"
                    compact
                    style={styles.flex}
                    disabled={busyId === item.id}
                    onPress={() => void changeStatus(item, 'open')}
                  />
                )}
              </View>
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
  tabs: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm },
  bannerWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  list: { padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xxl },
  card: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  title: { ...typography.body, fontWeight: '700', flex: 1, fontSize: 15 },
  badges: { alignItems: 'flex-end', gap: 6 },
  body: { ...typography.bodyMuted, marginTop: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm, flexWrap: 'wrap' },
  meta: { ...typography.caption, textTransform: 'capitalize' },
  metaDot: { ...typography.caption },
  overdue: { color: colors.danger, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
});