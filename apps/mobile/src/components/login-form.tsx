import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { router } from 'expo-router';
import { icons, natureLoginColors as c, natureLoginMetrics as m } from '@hsm/ui';
import { LoginField } from './login-field';
import { LoginModePicker } from './login-mode';
import { useLoginForm } from './use-login-form';
import { LoginLink } from './login-screen';

function LoginSubmit({ loading, onPress }: { loading: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign In"
      accessibilityState={{ disabled: loading, busy: loading }}
      disabled={loading}
      onPress={onPress}
      android_ripple={{ color: c.glassHighlight }}
      style={[styles.button, { backgroundColor: loading ? c.disabled : c.primary }]}
    >
      {loading ? <ActivityIndicator accessible={false} color={c.dark} /> : null}
      <Text style={[styles.buttonText, { color: loading ? c.dark : c.surface }]}>
        {loading ? 'Signing in…' : 'Sign In'}
      </Text>
      {!loading ? (
        <View pointerEvents="none" style={styles.arrow}>
          <ArrowRight
            accessible={false}
            size={m.iconSize + m.xs}
            color={c.surface}
            strokeWidth={icons.strokeWidth}
          />
        </View>
      ) : null}
    </Pressable>
  );
}
export function LoginForm({
  submit,
}: {
  submit: (values: Record<string, string>) => Promise<string>;
}) {
  const form = useLoginForm(submit);
  return (
    <View>
      <View style={styles.mode}>
        <LoginModePicker mode={form.mode} select={form.select} disabled={form.loading} />
      </View>
      <View style={styles.fields}>
        <LoginField
          key={form.mode}
          name={form.mode}
          value={form.values[form.mode]}
          error={form.errors[form.mode]}
          disabled={form.loading}
          onChange={(value) => form.change(form.mode, value)}
        />
        <LoginField
          name="password"
          value={form.values.password}
          error={form.errors.password}
          disabled={form.loading}
          onChange={(value) => form.change('password', value)}
        />
      </View>
      <View style={styles.recovery}>
        <LoginLink label="Forgot password?" onPress={() => router.push('/auth/recover')} />
      </View>
      {form.failure ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {form.failure}
        </Text>
      ) : null}
      <LoginSubmit
        loading={form.loading}
        onPress={() => {
          void form.signIn();
        }}
      />
      <View style={styles.signup}>
        <Text style={styles.secondary}>Don't have an account?</Text>
        <LoginLink label="Sign up" onPress={() => router.push('/auth/register')} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  mode: { marginBottom: m.lg + m.xs / 2 },
  fields: { gap: m.lg },
  recovery: { alignItems: 'flex-end' },
  secondary: {
    color: c.secondary,
    fontSize: m.fieldSize,
    fontFamily: 'PlusJakartaSans_400Regular',
    flexShrink: 1,
  },
  error: {
    color: c.error,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: m.fieldSize,
    marginBottom: m.sm,
  },
  button: {
    minHeight: m.buttonHeight,
    borderRadius: m.buttonRadius,
    padding: m.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: m.sm,
    boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 14, color: c.shadow }],
  },
  buttonText: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontSize: m.xl,
    fontFamily: 'PlusJakartaSans_700Bold',
    textAlign: 'center',
    flexShrink: 1,
  },
  arrow: { position: 'absolute', right: m.xl, top: 0, bottom: 0, justifyContent: 'center' },
  signup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: m.xs,
    minHeight: m.buttonHeight - m.xs,
    paddingTop: m.sm,
  },
});
