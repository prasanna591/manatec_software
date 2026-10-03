import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../auth/AuthContext';
import { getUnread, subscribeUnread } from '../unread';
import { colors } from '../theme';
import HomeScreen from '../screens/HomeScreen';
import TasksScreen from '../screens/TasksScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';

type IoniconName = keyof typeof Ionicons.glyphMap;

const TABS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Tasks: { active: 'checkmark-circle', inactive: 'checkmark-circle-outline' },
  Notifications: { active: 'notifications', inactive: 'notifications-outline' },
  Profile: { active: 'person-circle', inactive: 'person-circle-outline' },
};

function TabIcon({ route, focused, color, size }: { route: string; focused: boolean; color: string; size: number }) {
  const icon = TABS[route] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
  return <Ionicons name={focused ? icon.active : icon.inactive} color={color} size={size} />;
}

function tabIcon(route: string) {
  return ({ focused, color, size }: { focused: boolean; color: string; size: number }) =>
    <TabIcon route={route} focused={focused} color={color} size={size} />;
}

const Tabs = createBottomTabNavigator();

function useUnreadBadge(): number {
  const [badge, setBadge] = useState(getUnread());
  useEffect(() => subscribeUnread(() => setBadge(getUnread())), []);
  return badge;
}

function MainTabs() {
  const badge = useUnreadBadge();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontWeight: '600', fontSize: 12 },
      }}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: tabIcon('Home') }} />
      <Tabs.Screen name="Tasks" component={TasksScreen} options={{ tabBarIcon: tabIcon('Tasks') }} />
      <Tabs.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarIcon: tabIcon('Notifications'),
          tabBarBadge: badge > 0 ? badge : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger },
        }}
      />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: tabIcon('Profile') }} />
    </Tabs.Navigator>
  );
}

const LOGO = require('../../assets/icon.png');

function Splash() {
  return (
    <View style={styles.splash}>
      <Image source={LOGO} style={styles.logo} />
    </View>
  );
}

function Reconnect({ error }: { error: string | null }) {
  const { reconnect } = useAuth();
  return (
    <View style={styles.splash}>
      <Image source={LOGO} style={styles.logo} />
      <Text style={styles.error}>{error ?? 'Could not connect to the server.'}</Text>
      <TouchableOpacity style={styles.retry} onPress={() => void reconnect()} activeOpacity={0.8}>
        <Text style={styles.retryText}>RETRY</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RootNavigator() {
  const { user, initializing, authError } = useAuth();

  if (initializing) return <Splash />;

  return (
    <NavigationContainer>
      {user ? <MainTabs /> : <Reconnect error={authError} />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryDark },
  logo: { width: 120, height: 120, borderRadius: 28 },
  error: { color: '#fecaca', marginTop: 16, paddingHorizontal: 24, textAlign: 'center' },
  retry: {
    marginTop: 20,
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  retryText: { color: colors.primaryDark, fontWeight: '700', letterSpacing: 1 },
});