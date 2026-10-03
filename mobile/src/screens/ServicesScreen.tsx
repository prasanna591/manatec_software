import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../auth/AuthContext';
import { colors, spacing } from '../theme';

type Route = 'Attendance' | 'Leave' | 'Guests' | 'Notices' | 'Catalog' | 'Stock' | 'Procurement' | 'Production' | 'Quotes';

interface ServiceItem {
  route: Route;
  title: string;
  subtitle: string;
  accent: string;
}

export default function ServicesScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const perms = new Set(user?.permissions ?? []);
  const has = (m: string) => Array.from(perms).some((p) => p.startsWith(`${m}:`));

  const common: ServiceItem[] = [
    { route: 'Attendance', title: 'Attendance', subtitle: 'Check in / out & department roster', accent: colors.primary },
    { route: 'Leave', title: 'Leave', subtitle: 'Balances, apply & approvals', accent: colors.ok },
    { route: 'Guests', title: 'Guest visits', subtitle: 'Register visitors & gate security', accent: colors.warn },
    { route: 'Notices', title: 'Company notices', subtitle: 'Official announcements', accent: colors.danger },
  ];
  const dept: ServiceItem[] = [];
  if (has('Catalog')) dept.push({ route: 'Catalog', title: 'Catalogue', subtitle: 'Browse products & prices', accent: '#7c3aed' });
  if (has('Inventory')) dept.push({ route: 'Stock', title: 'Inventory', subtitle: 'Stock on hand, alerts & movements', accent: '#0d9488' });
  if (has('Purchase')) dept.push({ route: 'Procurement', title: 'Procurement', subtitle: 'Buy-list & purchase orders', accent: '#ea580c' });
  if (has('Production')) dept.push({ route: 'Production', title: 'Production', subtitle: 'Manufacturing orders & status', accent: '#2563eb' });
  if (has('Quotations')) dept.push({ route: 'Quotes', title: 'Quotations', subtitle: 'Sales quotes & confirmations', accent: '#db2777' });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Services</Text>
      <Text style={styles.subtitle}>
        {user?.role} · {user?.employee?.name ?? user?.username}
      </Text>

      <Text style={styles.sectionLabel}>EVERYONE</Text>
      {common.map((s) => (
        <ServiceCard key={s.route} item={s} onPress={() => navigation.navigate(s.route)} />
      ))}

      {dept.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>YOUR DEPARTMENT</Text>
          {dept.map((s) => (
            <ServiceCard key={s.route} item={s} onPress={() => navigation.navigate(s.route)} />
          ))}
        </>
      ) : (
        <Text style={styles.hint}>Management controls your department module access.</Text>
      )}
    </ScrollView>
  );
}

function ServiceCard({ item, onPress }: { item: ServiceItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.icon, { backgroundColor: item.accent }]}>
        <Text style={styles.iconText}>{item.title[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardSub}>{item.subtitle}</Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  heading: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { color: colors.muted, marginTop: 2, marginBottom: spacing.md },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  hint: { color: colors.muted, marginTop: spacing.sm, fontSize: 13 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  iconText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  chev: { color: colors.muted, fontSize: 24 },
});