import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthContext';
import { QueryProvider } from './src/api/QueryProvider';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <QueryProvider>
          <AuthProvider>
            <RootNavigator />
            <StatusBar style="auto" />
          </AuthProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}