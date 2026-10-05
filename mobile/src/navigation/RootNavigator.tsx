import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../auth/AuthContext';
import { SECURITY_ROLES } from '../auth/permissions';
import { getUnread, subscribeUnread } from '../unread';
import { ripple } from '../motion';
import { colors, radius, spacing, typography } from '../theme';
import { ErrorBanner } from '../components/ui';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import TasksScreen from '../screens/TasksScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ServicesScreen from '../screens/ServicesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import LeaveScreen from '../screens/LeaveScreen';
import GuestScreen from '../screens/GuestScreen';
import NoticesScreen from '../screens/NoticesScreen';
import CatalogScreen from '../screens/CatalogScreen';
import StockScreen from '../screens/StockScreen';
import ProcurementScreen from '../screens/ProcurementScreen';
import ProductionScreen from '../screens/ProductionScreen';
import QuotesScreen from '../screens/QuotesScreen';
import VisitsScreen from '../screens/VisitsScreen';
import QualityScreen from '../screens/QualityScreen';
import MachineShopScreen from '../screens/MachineShopScreen';
import MaterialRequestsScreen from '../screens/MaterialRequestsScreen';

type IoniconName = keyof typeof Ionicons.glyphMap;

const TABS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Tasks: { active: 'checkmark-circle', inactive: 'checkmark-circle-outline' },
  Work: { active: 'grid', inactive: 'grid-outline' },
  Notifications: { active: 'notifications', inactive: 'notifications-outline' },
  Profile: { active: 'person-circle', inactive: 'person-circle-outline' },
};

function tabIcon(route: string) {
  return ({ focused, color, size }: { focused: boolean; color: string; size: number }) => {
    const icon = TABS[route] ?? { active: 'ellipse' as IoniconName, inactive: 'ellipse-outline' as IoniconName };
    return <Ionicons name={focused ? icon.active : icon.inactive} color={color} size={size} />;
  };
}

const Tabs = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function useUnreadBadge(): number {
  const [badge, setBadge] = useState(getUnread());
  useEffect(() => subscribeUnread(() => setBadge(getUnread())), []);
  return badge;
}

/**
 * Every module reachable from the Work tab. Each entry carries the permission
 * the backend enforces, so the list only offers what the role can actually do.
 */
export const SERVICE_ROUTES = {
  Attendance: { component: AttendanceScreen, title: 'Attendance' },
  Leave: { component: LeaveScreen, title: 'Leave' },
  Visits: { component: VisitsScreen, title: 'Visits' },
  Guests: { component: GuestScreen, title: 'Guest visits' },
  Notices: { component: NoticesScreen, title: 'Company notices' },
  Catalog: { component: CatalogScreen, title: 'Catalogue' },
  Stock: { component: StockScreen, title: 'Inventory' },
  Procurement: { component: ProcurementScreen, title: 'Procurement' },
  Production: { component: ProductionScreen, title: 'Production' },
  Quality: { component: QualityScreen, title: 'Quality' },
  Machines: { component: MachineShopScreen, title: 'Machine shop' },
  MaterialReq: { component: MaterialRequestsScreen, title: 'Material requests' },
  Quotes: { component: QuotesScreen, title: 'Quotations' },
} as const;

export type ServiceRoute = keyof typeof SERVICE_ROUTES;

const SERVICES: {
  name: ServiceRoute;
  icon: IoniconName;
  perm?: string;
  roles?: readonly string[];
}[] = [
  { name: 'Attendance', icon: 'finger-print-outline' },
  { name: 'Leave', icon: 'calendar-outline' },
  { name: 'Visits', icon: 'walk-outline', perm: 'Visits' },
  // ServicesScreen lists this under "Gate & security" itself; the entry here only
  // mounts the screen and keeps it out of reach for other roles.
  { name: 'Guests', icon: 'people-outline', roles: SECURITY_ROLES },
  { name: 'Notices', icon: 'megaphone-outline', perm: 'Notifications' },
  { name: 'Catalog', icon: 'pricetags-outline', perm: 'Catalog' },
  { name: 'Stock', icon: 'cube-outline', perm: 'Inventory' },
  { name: 'Procurement', icon: 'cart-outline', perm: 'Purchase' },
  { name: 'Production', icon: 'construct-outline', perm: 'Production' },
  { name: 'Quality', icon: 'shield-checkmark-outline', perm: 'Quality' },
  { name: 'Machines', icon: 'hardware-chip-outline', perm: 'Machines' },
  { name: 'MaterialReq', icon: 'file-tray-stacked-outline', perm: 'MaterialReq' },
  { name: 'Quotes', icon: 'document-text-outline', perm: 'Quotations' },
];

const LOGO = require('../../assets/icon.png');

function Splash() {
  return (
    <View style={styles.splash}>
      <Image source={LOGO} style={styles.splashLogo} />
      <Text style={styles.splashText}>Manatec Digital</Text>
      <ActivityIndicator color="#ffffff" style={styles.splashSpinner} />
    </View>
  );
}

/** Shown when a stored session exists but the API could not be reached. */
function OfflineGate({
  error,
  onRetry,
  onSignOut,
}: {
  error: string | null;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.gate}>
      <Image source={LOGO} style={styles.gateLogo} />
      <Text style={styles.gateTitle}>Can't reach the server</Text>
      <View style={styles.gateBanner}>
        <ErrorBanner message={error ?? 'The plant API did not respond.'} />
      </View>
      <Pressable
        style={styles.gateBtn}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry"
        {...ripple('#ffffff')}
      >
        <Text style={styles.gateBtnText}>RETRY</Text>
      </Pressable>
      <Pressable
        style={styles.gateLink}
        onPress={onSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign in with a different account"
        {...ripple(colors.primary)}
      >
        <Text style={styles.gateLinkText}>Sign in with a different account</Text>
      </Pressable>
    </View>
  );
}

function ServicesStack() {
  const { can, isInRole } = useAuth();
  const visible = useMemo(
    () =>
      SERVICES.filter((s) => {
        if (s.roles && !isInRole(s.roles)) return false;
        if (s.perm && !can(s.perm, 'view')) return false;
        return true;
      }),
    [can, isInRole],
  );

  return (
    <Stack.Navigator
      initialRouteName="WorkIndex"
      screenOptions={({ navigation }) => ({
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerLeft: () => (
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            {...ripple(colors.primary)}
          >
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </Pressable>
        ),
      })}
    >
      <Stack.Screen
        name="WorkIndex"
        component={ServicesScreen}
        options={{ title: 'Work', headerShown: false }}
      />
      {visible.map((s) => (
        <Stack.Screen
          key={s.name}
          name={s.name}
          component={SERVICE_ROUTES[s.name].component}
          options={{ title: SERVICE_ROUTES[s.name].title }}
        />
      ))}
    </Stack.Navigator>
  );
}

function MainTabs() {
  const badge = useUnreadBadge();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Home', tabBarIcon: tabIcon('Home') }}
      />
      <Tabs.Screen
        name="Tasks"
        component={TasksScreen}
        options={{ title: 'My Tasks', tabBarIcon: tabIcon('Tasks') }}
      />
      <Tabs.Screen
        name="Work"
        component={ServicesStack}
        options={{ title: 'Work', headerShown: false, tabBarIcon: tabIcon('Work') }}
      />
      <Tabs.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Alerts',
          tabBarIcon: tabIcon('Notifications'),
          tabBarBadge: badge > 0 ? badge : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: tabIcon('Profile') }}
      />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { user, initializing, authError, reconnect, signOut } = useAuth();

  if (initializing) return <Splash />;

  // Offline takes priority: a stored token survives a network blip, so the user
  // must get a retry instead of being bounced to the login screen.
  if (authError) {
    return (
      <NavigationContainer>
        <OfflineGate
          error={authError}
          onRetry={() => void reconnect()}
          onSignOut={() => void signOut()}
        />
      </NavigationContainer>
    );
  }

  if (!user) return <LoginScreen />;

  return (
    <NavigationContainer>
      <MainTabs />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDark,
  },
  splashLogo: { width: 96, height: 96, borderRadius: 24 },
  splashText: { color: '#ffffff', fontSize: 18, fontWeight: '800', marginTop: spacing.lg },
  splashSpinner: { marginTop: spacing.xl },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: spacing.xl,
  },
  gateLogo: { width: 72, height: 72, borderRadius: 18, marginBottom: spacing.lg },
  gateTitle: { ...typography.title, marginBottom: spacing.md },
  gateBanner: { alignSelf: 'stretch' },
  gateBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  gateBtnText: { color: '#ffffff', fontWeight: '800', letterSpacing: 1 },
  gateLink: { marginTop: spacing.lg },
  gateLinkText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  backBtn: { paddingRight: spacing.sm },
});