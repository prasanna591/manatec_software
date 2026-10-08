import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info });
    if (__DEV__) {
      console.error('[AppErrorBoundary]', error, info.componentStack);
    }
  }

  private reset = (): void => {
    this.setState({ error: null, info: null });
  };

  render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.badge}>RUNTIME ERROR</Text>
          <Text style={styles.title}>The app hit an unexpected error</Text>
          <Text style={styles.message}>{error.message}</Text>

          {__DEV__ && info?.componentStack ? (
            <View style={styles.stackBox}>
              <Text style={styles.stackLabel}>COMPONENT STACK</Text>
              <Text style={styles.stack}>{info.componentStack.trim()}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={this.reset}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Reload the app"
          >
            <Text style={styles.buttonText}>Reload app</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingTop: spacing.xxl },
  badge: {
    ...typography.overline,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  title: { ...typography.title, marginBottom: spacing.sm },
  message: {
    ...typography.body,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  stackBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  stackLabel: { ...typography.overline, marginBottom: spacing.sm },
  stack: { ...typography.caption, color: colors.muted },
  button: {
    marginTop: spacing.xl,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: colors.primaryDark },
  buttonText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
});