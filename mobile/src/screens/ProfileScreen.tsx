import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { colors, spacing } from '../theme';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  const emp = user?.employee;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{emp?.name?.[0] ?? user?.username?.[0]}</Text>
      </View>
      <Text style={styles.name}>{emp?.name ?? user?.username}</Text>
      <Text style={styles.subtitle}>{user?.role}</Text>

      <View style={styles.card}>
        <Row label="Employee code" value={emp?.code ?? '—'} />
        <Row label="Username" value={user?.username ?? '—'} />
        <Row label="Department ID" value={user?.department_id != null ? String(user.department_id) : '—'} />
        <Row label="Permissions" value={`${user?.permissions.length ?? 0} grants`} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>ACCESS GRANTS</Text>
        <View style={styles.perms}>
          {(user?.permissions ?? []).slice(0, 12).map((p) => (
            <View key={p} style={styles.badge}>
              <Text style={styles.badgeText}>{p}</Text>
            </View>
          ))}
          {(user?.permissions ?? []).length > 12 ? (
            <Text style={styles.more}>+{(user?.permissions ?? []).length - 12} more</Text>
          ) : null}
        </View>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={signOut} activeOpacity={0.8}>
        <Text style={styles.signOutText}>SIGN OUT</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, alignItems: 'center' },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  subtitle: { color: colors.muted, textTransform: 'capitalize', marginTop: 2 },
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.muted, fontSize: 14 },
  rowValue: { color: colors.text, fontWeight: '600', fontSize: 14 },
  cardLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  perms: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badge: {
    backgroundColor: colors.primarySoft,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  badgeText: { color: colors.primaryDark, fontSize: 11, fontWeight: '600' },
  more: { color: colors.muted, fontSize: 12, alignSelf: 'center', marginLeft: spacing.sm },
  signOut: {
    alignSelf: 'stretch',
    backgroundColor: colors.dangerSoft,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  signOutText: { color: colors.danger, fontWeight: '700', letterSpacing: 0.5 },
});