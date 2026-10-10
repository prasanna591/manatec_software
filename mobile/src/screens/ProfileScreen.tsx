import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { api } from '../api/client';
import type { SessionInfo } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ACTIONS } from '../auth/permissions';
import { Button, Card, Divider, KeyValue, Monogram, SectionHeader } from '../components/ui';
import {
  colors,
  formatDateTime,
  NOT_SET,
  radius,
  spacing,
  typography,
  withAlpha,
} from '../theme';

export default function ProfileScreen() {
  const { user, signOut, signOutAll } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  /** Group the flat "Module:action" grants by module so access is readable. */
  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const grant of user?.permissions ?? []) {
      const [mod, action] = grant.split(':');
      if (!mod || !action) continue;
      const list = map.get(mod) ?? [];
      list.push(ACTIONS[action as keyof typeof ACTIONS] ?? action);
      map.set(mod, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [user?.permissions]);

  // Device/session list (AGENT.md §3). Best-effort: never blocks the screen.
  useEffect(() => {
    let alive = true;
    api
      .sessions()
      .then((r) => {
        if (alive) setSessions(r.items.filter((s) => s.active));
      })
      .catch(() => {
        if (alive) setSessions([]);
      });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  if (!user) return null;

  const emp = user.employee;
  const displayName = emp?.name ?? user.username;
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Monogram label={initials} seed={user.id} size={72} />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.subtitle}>
          {emp?.name ? user.username : `${user.username} · platform account`}
        </Text>
        <View style={styles.roleChip}>
          <Ionicons name="shield-checkmark" size={14} color="#ffffff" />
          <Text style={styles.roleChipText}>{user.role}</Text>
        </View>
      </View>

      <SectionHeader label="Account" />
      <Card style={styles.card}>
        <KeyValue label="Employee code" value={emp?.code ?? NOT_SET} />
        <Divider />
        <KeyValue label="Username" value={user.username} />
        <Divider />
        <KeyValue
          label="Department"
          value={user.department_id != null ? `#${user.department_id}` : NOT_SET}
        />
        <Divider />
        <KeyValue label="Permission grants" value={`${user.permissions.length}`} />
      </Card>

      <SectionHeader label={`Access by module (${grouped.length})`} />
      <Card style={styles.card}>
        {grouped.map(([mod, actions], i) => (
          <View key={mod}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.permRow}>
              <Text style={styles.permModule}>{mod}</Text>
              <View style={styles.actions}>
                {actions.map((a) => (
                  <View key={a} style={styles.actionChip}>
                    <Text style={styles.actionChipText}>{a}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}
      </Card>

      <Text style={styles.footnote}>
        Access is enforced by the server. Hiding a control never grants a permission.
      </Text>

      <SectionHeader label={`Active devices (${sessions.length})`} />
      <Card style={styles.card}>
        {sessions.length === 0 ? (
          <Text style={styles.sessionEmpty}>No active sessions listed.</Text>
        ) : (
          sessions.map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.sessionRow}>
                <Ionicons name="phone-portrait-outline" size={16} color={colors.muted} />
                <View style={styles.sessionText}>
                  <Text style={styles.sessionTitle} numberOfLines={1}>
                    {s.device || s.user_agent || 'Unknown device'}
                  </Text>
                  <Text style={styles.sessionMeta} numberOfLines={1}>
                    {s.ip ? `${s.ip} · ` : ''}
                    {s.last_used_at ? `last used ${formatDateTime(s.last_used_at)}` : 'current'}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </Card>

      <Button
        label="Sign out"
        variant="danger"
        icon={<Ionicons name="log-out-outline" size={17} color="#ffffff" />}
        onPress={() => void signOut()}
        style={styles.signOut}
      />
      <Button
        label="Sign out of all devices"
        variant="secondary"
        icon={<Ionicons name="log-out-outline" size={17} color={colors.text} />}
        onPress={() => void signOutAll()}
        style={styles.signOutAll}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  name: { ...typography.title, marginTop: spacing.md, textAlign: 'center' },
  subtitle: { ...typography.bodyMuted, marginTop: 2 },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    marginTop: spacing.md,
  },
  roleChipText: { color: '#ffffff', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  card: { marginBottom: spacing.md },
  permRow: { paddingVertical: spacing.sm, gap: spacing.sm },
  permModule: { ...typography.body, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionChip: {
    backgroundColor: withAlpha(colors.primary, 0.1),
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  actionChipText: { fontSize: 11, color: colors.primaryDark, fontWeight: '700' },
  footnote: { ...typography.caption, textAlign: 'center', marginTop: spacing.sm },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  sessionText: { flex: 1 },
  sessionTitle: { ...typography.body, fontWeight: '600' },
  sessionMeta: { ...typography.caption, marginTop: 2 },
  sessionEmpty: { ...typography.bodyMuted, paddingVertical: spacing.sm },
  signOut: { marginTop: spacing.lg },
  signOutAll: { marginTop: spacing.sm },
});