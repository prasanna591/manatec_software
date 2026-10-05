import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { Button, ErrorBanner } from '../components/ui';
import { ripple } from '../motion';
import { colors, radius, spacing, typography, withAlpha } from '../theme';

const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'admin123', role: 'ADMIN', label: 'Administrator' },
  { username: 'manager', password: 'demo123', role: 'MGMT', label: 'Plant Manager' },
  { username: 'stores', password: 'demo123', role: 'STORE', label: 'Stores' },
  { username: 'purchase', password: 'demo123', role: 'PUR', label: 'Purchase' },
  { username: 'planner', password: 'demo123', role: 'PLNR', label: 'Planning' },
  { username: 'hr', password: 'demo123', role: 'HR', label: 'HR Officer' },
];

export default function LoginScreen() {
  const { signIn, signingIn, authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password) {
      setLocalError('Enter both username and password.');
      return;
    }
    setLocalError(null);
    try {
      await signIn(username, password);
    } catch {
      // surfaced through authError
    }
  };

  const useDemo = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setLocalError(null);
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={styles.heroBlobOne} />
        <View style={styles.heroBlobTwo} />
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={styles.brand}>Manatec Digital</Text>
        <Text style={styles.brandSub}>Plant operations, in your pocket</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={typography.title}>Sign in</Text>
          <Text style={styles.sheetHint}>Use your plant credentials to continue.</Text>

          {authError || localError ? (
            <ErrorBanner message={localError ?? (authError as string)} />
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              accessibilityLabel="Username"
              placeholder="e.g. manager"
              placeholderTextColor={colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              returnKeyType="next"
              testID="login-username"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                accessibilityLabel="Password"
                accessibilityHint="Enter your account password"
                placeholder="••••••••"
                placeholderTextColor={colors.textLight}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={[styles.input, styles.passwordInput]}
                returnKeyType="go"
                onSubmitEditing={submit}
                testID="login-password"
              />
              <Pressable
                onPress={() => setShowPassword((s) => !s)}
                hitSlop={10}
                style={styles.eye}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                accessibilityState={{ expanded: showPassword }}
                {...ripple(colors.primary)}
              >
                <Text style={styles.eyeText}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
              </Pressable>
            </View>
          </View>

          <Button
            label={signingIn ? 'Signing in…' : 'Sign in'}
            onPress={submit}
            loading={signingIn}
            style={styles.cta}
          />

          {__DEV__ ? (
            <>
              <Text style={styles.demoLabel}>DEMO ACCOUNTS</Text>
              <View style={styles.demoGrid}>
                {DEMO_ACCOUNTS.map((a) => (
                  <Pressable
                    key={a.username}
                    onPress={() => useDemo(a.username, a.password)}
                    style={({ pressed }) => [styles.demoChip, pressed && styles.demoChipPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Fill demo ${a.role} credentials`}
                    accessibilityHint={a.label}
                    {...ripple(colors.primary)}
                  >
                    <Text style={styles.demoRole}>{a.role}</Text>
                    <Text style={styles.demoLabel2}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: {
    backgroundColor: colors.primaryDark,
    paddingTop: spacing.xxl + spacing.lg,
    paddingBottom: spacing.xxl + spacing.xl,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroBlobOne: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: withAlpha(colors.primary, 0.45),
    top: -90,
    right: -60,
  },
  heroBlobTwo: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: withAlpha(colors.teal, 0.3),
    bottom: -70,
    left: -40,
  },
  logo: {
    width: 68,
    height: 68,
    borderRadius: 18,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: withAlpha('#ffffff', 0.25),
  },
  brand: { color: '#ffffff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  brandSub: { color: withAlpha('#ffffff', 0.75), fontSize: 13, marginTop: 2 },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    marginTop: -spacing.xl,
  },
  sheetContent: { padding: spacing.xl, paddingBottom: spacing.xxl },
  sheetHint: { ...typography.bodyMuted, marginTop: 2, marginBottom: spacing.lg },
  field: { marginBottom: spacing.lg },
  label: { ...typography.caption, fontWeight: '700', marginBottom: 6, color: colors.muted },
  input: {
    height: 50,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    color: colors.text,
  },
  passwordWrap: { justifyContent: 'center' },
  passwordInput: { paddingRight: 62 },
  eye: { position: 'absolute', right: spacing.lg },
  eyeText: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  cta: { marginTop: spacing.sm },
  demoLabel: { ...typography.overline, marginTop: spacing.xl, marginBottom: spacing.md },
  demoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  demoChip: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minWidth: '46%',
    flexGrow: 1,
  },
  demoChipPressed: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  demoRole: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  demoLabel2: { ...typography.caption, marginTop: 1 },
});