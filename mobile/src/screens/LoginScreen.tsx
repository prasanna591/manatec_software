import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';

export function LoginScreen() {
  const { user, initializing, authError } = useAuth();
  const [username, setUsername] = useState('manager');
  const [password, setPassword] = useState('demo123');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    () => {
      setUsername('manager');
      setPassword('demo123');
      setError(null);
      return () => {};
    },
    [username, password],
  );

  const handleLogin = async () => {
    try {
      setError(null);
      await api.login(username, password);
      // After login, the AuthProvider useEffect will run and set up the session
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Login failed');
    }
  };

  if (initializing) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Manatec Digital</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          style={styles.input}
          autoCapitalize="none"
        />
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />
      </View>

      <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={initializing}>
        {initializing ? (
          <Text style={styles.btnText}>Signing in…</Text>
        ) : (
          <Text style={styles.btnText}>Sign in</Text>
        )}
      </TouchableOpacity>

      {authError && (
        <View style={styles.error}>
          <Text style={styles.errorText}>{authError}</Text>
        </View>
      )}

      <View style={styles.divider}>
        <Text style={styles.dividerText}>or</Text>
      </View>

      <TouchableOpacity style={styles.googleBtn} onPress={handleLogin}>
        <Text style={styles.googleBtnText}>Sign in with credentials</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 32,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 48,
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  inputContainer: {
    marginBottom: 24,
  },
  input: {
    height: 50,
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  btn: {
    height: 50,
    borderRadius: 10,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    marginVertical: 16,
    padding: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerText: {
    color: '#64748b',
    paddingHorizontal: 8,
    fontSize: 12,
  },
  googleBtn: {
    height: 50,
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  googleBtnText: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: '600',
  },
});