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
import type { Task, TaskStatus } from '../api/types';
import { colors, priorityColor, spacing } from '../theme';

type Filter = 'active' | 'all' | 'done';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Done' },
];

function dueLabel(due: string | null): string {
  if (!due) return 'No due date';
  const d = new Date(due);
  const today = new Date();
  const overdue = d.getTime() < today.getTime() && d.toDateString() !== today.toDateString();
  return `${overdue ? 'Overdue · ' : 'Due '}${d.toLocaleDateString()}`;
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
      setError(e instanceof Error ? e.message : 'Failed to load tasks');
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

  const changeStatus = useCallback(
    async (task: Task, status: TaskStatus) => {
      setBusyId(task.id);
      try {
        const updated = await api.setTaskStatus(task.id, status);
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Update failed');
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const visible = tasks.filter((t) => {
    if (filter === 'active') return t.status === 'open' || t.status === 'in_progress';
    if (filter === 'done') return t.status === 'done';
    return true;
  });

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.tab, filter === f.key && styles.tabActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.tabText, filter === f.key && styles.tabTextActive]}>
              {f.label}
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
          keyExtractor={(t) => String(t.id)}
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
          ListEmptyComponent={<Text style={styles.empty}>No tasks here.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={[styles.priority, { color: priorityColor[item.priority] ?? colors.muted }]}>
                  {item.priority}
                </Text>
              </View>
              {item.description ? <Text style={styles.body}>{item.description}</Text> : null}
              <Text style={styles.meta}>
                {item.type.replace('_', ' ')}
                {item.source_ref ? ` · ${item.source_ref}` : ''} · {dueLabel(item.due_date)}
              </Text>

              <View style={styles.actions}>
                {item.status !== 'in_progress' && item.status !== 'done' ? (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    disabled={busyId === item.id}
                    onPress={() => changeStatus(item, 'in_progress')}
                  >
                    <Text style={styles.btnPrimaryText}>Start</Text>
                  </TouchableOpacity>
                ) : null}
                {item.status !== 'done' ? (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnOk]}
                    disabled={busyId === item.id}
                    onPress={() => changeStatus(item, 'done')}
                  >
                    <Text style={styles.btnOkText}>Complete</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnGhost]}
                    disabled={busyId === item.id}
                    onPress={() => changeStatus(item, 'open')}
                  >
                    <Text style={styles.btnGhostText}>Reopen</Text>
                  </TouchableOpacity>
                )}
              </View>
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  priority: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginLeft: spacing.sm },
  body: { color: colors.muted, marginTop: spacing.xs },
  meta: { color: colors.muted, fontSize: 12, marginTop: spacing.sm, textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: 8 },
  btnPrimary: { backgroundColor: colors.primarySoft },
  btnPrimaryText: { color: colors.primaryDark, fontWeight: '700' },
  btnOk: { backgroundColor: colors.okSoft },
  btnOkText: { color: colors.ok, fontWeight: '700' },
  btnGhost: { backgroundColor: colors.bg },
  btnGhostText: { color: colors.muted, fontWeight: '700' },
});
