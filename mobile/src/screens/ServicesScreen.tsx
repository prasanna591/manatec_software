import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAuth } from '../auth/AuthContext';
import { Card, Monogram, SectionHeader } from '../components/ui';
import { accentFor, colors, radius, spacing, typography, withAlpha } from '../theme';
import type { ServiceRoute } from '../navigation/RootNavigator';

interface ServiceItem {
  route: ServiceRoute;
  title: string;
  subtitle: string;
  icon: string;
}

export default function ServicesScreen() {
  const { user, can } = useAuth();
  const navigation = useNavigation<any>();

    const everyone: ServiceItem[] = [
    {
      route: 'Attendance',
      title: 'Attendance',
      subtitle: 'Check in / out & department roster',
      icon: 'finger-print-outline',
    },
    {
      route: 'Leave',
      title: 'Leave',
      subtitle: 'Balances, apply & approvals',
      icon: 'calendar-outline',
    },
  ];

  // Common company-wide service: any employee may raise one, so it is not gated
  // behind a department the way the rest of this list is.
  if (can('Visits', 'view')) {
    everyone.push({
      route: 'Visits',
      title: 'Visits',
      subtitle: 'Raise, host & close supplier and buyer visits',
      icon: 'walk-outline',
    });
  }

  everyone.push({
    route: 'Notices',
    title: 'Company notices',
    subtitle: 'Official announcements',
    icon: 'megaphone-outline',
  });

  const security: ServiceItem[] = can('Guests', 'view')
    ? [
        {
          route: 'Guests',
          title: 'Guest visits',
          subtitle: 'Register visitors & gate security',
          icon: 'people-outline',
        },
      ]
    : [];

  const dept: ServiceItem[] = [];
  if (can('Catalog', 'view'))
    dept.push({
      route: 'Catalog',
      title: 'Catalogue',
      subtitle: 'Browse products & prices',
      icon: 'pricetags-outline',
    });
  if (can('Inventory', 'view'))
    dept.push({
      route: 'Stock',
      title: 'Inventory',
      subtitle: 'Stock on hand, alerts & movements',
      icon: 'cube-outline',
    });
  if (can('MaterialReq', 'view'))
    dept.push({
      route: 'MaterialReq',
      title: 'Material requests',
      subtitle: 'Raise with stores & track fulfilment',
      icon: 'file-tray-stacked-outline',
    });
  if (can('Purchase', 'view'))
    dept.push({
      route: 'Procurement',
      title: 'Procurement',
      subtitle: 'Buy-list & purchase orders',
      icon: 'cart-outline',
    });
  if (can('Production', 'view'))
    dept.push({
      route: 'Production',
      title: 'Production',
      subtitle: 'Manufacturing orders & status',
      icon: 'construct-outline',
    });
  if (can('Quality', 'view'))
    dept.push({
      route: 'Quality',
      title: 'Quality',
      subtitle: 'Inspections, checklists & NCRs',
      icon: 'shield-checkmark-outline',
    });
  if (can('Machines', 'view'))
    dept.push({
      route: 'Machines',
      title: 'Machine shop',
      subtitle: 'Machine status, jobs & downtime',
      icon: 'hardware-chip-outline',
    });
  if (can('Quotations', 'view'))
    dept.push({
      route: 'Quotes',
      title: 'Quotations',
      subtitle: 'Sales quotes & confirmations',
      icon: 'document-text-outline',
    });

  const groups: { label: string; items: ServiceItem[] }[] = [
    { label: 'For everyone', items: everyone },
    { label: 'Gate & security', items: security },
    { label: 'Your department', items: dept },
  ].filter((g) => g.items.length > 0);

  const accent = accentFor(user?.role ?? 'x');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Card level={2} style={styles.hero}>
        <View style={[styles.heroStripe, { backgroundColor: accent }]} />
        <Text style={typography.overline}>SIGNED IN AS</Text>
        <Text style={styles.heroRole}>{user?.role}</Text>
        <Text style={styles.heroName}>
          {user?.employee?.name ?? user?.username}
          {user?.employee?.code ? ` · ${user.employee.code}` : ''}
        </Text>
        <View style={styles.heroChips}>
          <View style={[styles.chip, { backgroundColor: withAlpha(accent, 0.14) }]}>
            <Text style={[styles.chipText, { color: accent }]}>
              {dept.length} department module{dept.length === 1 ? '' : 's'} ·{' '}
              {everyone.length} common
            </Text>
          </View>
          <View style={styles.chipNeutral}>
            <Text style={styles.chipTextNeutral}>{user?.permissions.length ?? 0} permissions</Text>
          </View>
        </View>
      </Card>

      {groups.map((g) => (
        <View key={g.label}>
          <SectionHeader label={g.label} />
          {g.items.map((s) => (
            <ServiceCard
              key={s.route}
              item={s}
              onPress={() => navigation.navigate(s.route)}
            />
          ))}
        </View>
      ))}

      {dept.length === 0 ? (
        <Text style={styles.hint}>
          Your role has no department module grants. Management assigns Catalogue, Inventory,
          Procurement, Production, Quality, Machine shop and Quotation access.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function ServiceCard({ item, onPress }: { item: ServiceItem; onPress: () => void }) {
  const accent = accentFor(item.route);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
    >
      <Monogram label={item.title} seed={item.route} size={44} />
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardSub} numberOfLines={2}>
          {item.subtitle}
        </Text>
      </View>
      <View style={[styles.chevron, { backgroundColor: withAlpha(accent, 0.12) }]}>
        <Ionicons name="chevron-forward" size={16} color={accent} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: { overflow: 'hidden', paddingTop: spacing.xl },
  heroStripe: { position: 'absolute', left: 0, right: 0, top: 0, height: 4 },
  heroRole: { ...typography.display, marginTop: 2 },
  heroName: { ...typography.bodyMuted, marginTop: 2 },
  heroChips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  chipNeutral: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.bgSoft,
  },
  chipText: { fontSize: 11, fontWeight: '800' },
  chipTextNeutral: { fontSize: 11, fontWeight: '700', color: colors.muted },
  hint: { ...typography.caption, marginTop: spacing.lg, lineHeight: 18 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  cardPressed: { backgroundColor: colors.cardSoft, borderColor: colors.primary },
  cardText: { flex: 1 },
  cardTitle: { ...typography.section },
  cardSub: { ...typography.caption, marginTop: 1 },
  chevron: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});