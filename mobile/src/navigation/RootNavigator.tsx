import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAuth } from '../auth/AuthContext';
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
}[] = [
  { name: 'Attendance', icon: 'finger-print-outline' },
  { name: 'Leave', icon: 'calendar-outline' },
  { name: 'Visits', icon: 'walk-outline', perm: 'Visits' },
  // ServicesScreen lists this under "Gate & security" itself; the entry here only
  // mounts the screen and keeps it out of reach for other roles.
  { name: 'Guests', icon: 'people-outline', perm: 'Guests' },
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
    <SafeAreaView style={styles.splash} edges={['top', 'bottom']}>
      <Image source={LOGO} style={styles.splashLogo} />
      <Text style={styles.splashText}>Manatec Digital</Text>
      <ActivityIndicator color="#ffffff" style={styles.splashSpinner} />
    </SafeAreaView>
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
    <SafeAreaView style={styles.gate} edges={['top', 'bottom']}>
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
    </SafeAreaView>
  );
}

function ServicesStack() {
  const { can } = useAuth();
  const visible = useMemo(
    () =>
      SERVICES.filter((s) => {
        if (s.perm && !can(s.perm, 'view')) return false;
        return true;
      }),
    [can],
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

/**
 * Deep link paths. `Work` is a nested stack, so its children are listed under
 * the same key. `Login` is not reachable this way: the login screen renders
 * outside `NavigationContainer`, so a `manatec://login` link simply lands on
 * whatever the current session already shows.
 */
const linking: LinkingOptions<any> = {
  prefixes: ['manatec://', 'https://manatec.app'],
  config: {
    screens: {
      Home: 'home',
      Tasks: 'tasks',
      Work: {
        screens: {
          WorkIndex: 'work',
          Attendance: 'work/attendance',
          Leave: 'work/leave',
          Visits: 'work/visits',
          Guests: 'work/guests',
          Notices: 'work/notices',
          Catalog: 'work/catalog',
          Stock: 'work/inventory',
          Procurement: 'work/procurement',
          Production: 'work/production',
          Quality: 'work/quality',
          Machines: 'work/machines',
          MaterialReq: 'work/material-requests',
          Quotes: 'work/quotes',
        },
      },
      Notifications: 'notifications',
      Profile: 'profile',
    },
  },
};

export default function RootNavigator() {
  const { user, initializing, authError, reconnect, signOut } = useAuth();

  if (initializing) return <Splash />;

  // Offline takes priority: a stored token survives a network blip, so the user
  // must get a retry instead of being bounced to the login screen.
  // NOTE: no NavigationContainer here — there is no navigator to host yet,
  // and an empty container only adds a blank layer over the gate.
  if (authError) {
    return (
      <OfflineGate
        error={authError}
        onRetry={() => void reconnect()}
        onSignOut={() => void signOut()}
      />
    );
  }

  // LoginScreen is a plain view (no navigation used inside), but it must sit
  // inside the SafeAreaProvider so the hero / inputs are never hidden behind
  // the notch or status bar — previously it rendered edge-to-edge and looked
  // "invisible" on notched devices.
  if (!user) {
    return (
      <SafeAreaView style={styles.authShell} edges={['top', 'bottom']}>
        <LoginScreen />
      </SafeAreaView>
    );
  }

  // `linking` owns URL handling; a second raw `Linking` listener would duplicate
  // every navigation and leak because `onReady` never gets a cleanup.
  return (
    <NavigationContainer linking={linking}>
      <MainTabs />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
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
  authShell: { flex: 1, backgroundColor: colors.bg },
  backBtn: { paddingRight: spacing.sm },
});