import { useCallback, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { api } from '../api/client';
import type { CompanyNotice } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { messageOf } from '../auth/session';
import {
  AccessDenied,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  ScreenSkeleton,
  SectionHeader,
  TextField,
} from '../components/ui';
import { colors, formatDate, spacing, typography } from '../theme';

export default function NoticesScreen() {
  const { can } = useAuth();
  const canView = can('Notifications', 'view');
  const canPost = can('Notifications', 'create');

  const [notices, setNotices] = useState<CompanyNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '' });

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setNotices(await api.notices());
    } catch (e) {
      setError(messageOf(e, 'Failed to load announcements'));
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

  const post = useCallback(async () => {
    if (draft.title.trim().length < 2) {
      setError('Give the announcement a title of at least 2 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.postNotice({ title: draft.title.trim(), body: draft.body.trim() });
      setDraft({ title: '', body: '' });
      setComposing(false);
      await load();
    } catch (e) {
      setError(messageOf(e, 'Could not post the announcement'));
    } finally {
      setBusy(false);
    }
  }, [draft, load]);

  if (!canView) return <AccessDenied module="Notifications" />;
  if (loading) return <ScreenSkeleton label="Loading announcements" rows={5} />;

  return (
    <View style={styles.screen}>
      <View style={styles.bannerWrap}>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
        {canPost ? (
          <Button
            label={composing ? 'Cancel' : '+ Post announcement'}
            variant={composing ? 'secondary' : 'primary'}
            icon={
              <Ionicons
                name={composing ? 'close' : 'megaphone'}
                size={16}
                color={composing ? colors.text : '#ffffff'}
              />
            }
            onPress={() => setComposing((c) => !c)}
          />
        ) : null}
      </View>

      <FlatList
        data={notices}
        keyExtractor={(n) => String(n.id)}
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
          <>
            {composing && canPost ? (
              <Card level={2} style={styles.composer}>
                <SectionHeader label="New announcement" />
                <TextField
                  label="Title"
                  required
                  containerStyle={styles.field}
                  value={draft.title}
                  onChangeText={(v) => setDraft({ ...draft, title: v })}
                  placeholder="Short summary"
                />
                <TextField
                  label="Message"
                  containerStyle={styles.field}
                  style={styles.inputArea}
                  value={draft.body}
                  onChangeText={(v) => setDraft({ ...draft, body: v })}
                  placeholder="What does the floor need to know?"
                  multiline
                />
                <Text style={styles.hint}>Everyone on the platform receives a notification.</Text>
                <Button label="Publish" onPress={post} loading={busy} />
              </Card>
            ) : null}
            <SectionHeader label={`Company · ${notices.length} posted`} />
          </>
        }
        ListEmptyComponent={
          <EmptyState
            title="No announcements"
            hint={canPost ? 'Post the first one for the floor.' : 'Nothing posted right now.'}
          />
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.accent} />
            <View style={styles.flex}>
              <Text style={styles.title}>{item.title}</Text>
              {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
              <Text style={typography.caption}>{formatDate(item.created_at)}</Text>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  bannerWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  composer: { marginBottom: spacing.lg },
  field: { marginBottom: spacing.md },
  inputArea: { minHeight: 96, textAlignVertical: 'top' },
  hint: { ...typography.caption, marginBottom: spacing.md },
  card: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  accent: { width: 4, borderRadius: 2, backgroundColor: colors.primary },
  title: { ...typography.section },
  body: { ...typography.bodyMuted, marginVertical: 4, lineHeight: 20 },
});