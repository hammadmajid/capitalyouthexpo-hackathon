import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { natureLoginMetrics as m } from '@hsm/ui';
import { RegistrationFlow } from './registration-flow';
import { runAuth, type AuthFlowName } from '../lib/auth';
import { client } from '../lib/runtime';
import { useSession } from './providers';
import { authErrorMessage } from '../lib/auth-errors';
import { FlowForm, type Field } from './flow-form';
import { Copy } from './ui';
import { LoginScreen } from './login-screen';
import { LoginForm } from './login-form';
import { AuthButton, AuthInput, AuthLabel } from './auth-form-ui';
type CredentialFlowName = Exclude<AuthFlowName, 'register'>;
const email: Field = { name: 'email', label: 'Email address', keyboard: 'email-address' };
const code: Field = {
  name: 'code',
  numberFormat: 'plain',
  label: 'Six-digit email code',
  keyboard: 'number-pad',
};
const newPassword: Field = { name: 'newPassword', label: 'New password', secret: true };
const definitions: Record<
  Exclude<CredentialFlowName, 'login'>,
  { title: string; label: string; fields: readonly Field[] }
> = {
  verify: { title: 'Verify your email', label: 'Verify email', fields: [email, code] },
  resend: { title: 'Send another code', label: 'Send another code', fields: [email] },
  recover: { title: 'Forgot your password?', label: 'Send reset code', fields: [email] },
  reset: {
    title: 'Reset your password',
    label: 'Reset password',
    fields: [email, code, newPassword],
  },
  activate: {
    title: 'Activate manager account',
    label: 'Activate account',
    // AUTH-M-003: short labels; the hints inside the boxes are examples, not repeats.
    fields: [
      {
        name: 'phone',
        label: 'Mobile number',
        keyboard: 'phone-pad',
        placeholder: '03001234567',
      },
      {
        name: 'tempPassword',
        label: 'Temporary password',
        secret: true,
        placeholder: 'From the owner',
      },
      { ...newPassword, placeholder: 'At least 8 characters' },
    ],
  },
};
const descriptions = {
  verify: 'Enter the 6-digit code sent to your email.',
  resend: 'Enter your email to request a verification code.',
  recover: 'Enter your email address and we’ll send you a reset code.',
  reset: 'Enter your email code and choose a new password.',
  activate: undefined,
} as const;
export function AuthFlow({ flow }: { flow: AuthFlowName }) {
  return flow === 'register' ? <RegistrationFlow /> : <CredentialFlow flow={flow} />;
}
function CredentialFlow({ flow }: { flow: CredentialFlowName }) {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  async function submit(values: Record<string, string>): Promise<string> {
    const notice = await runAuth(flow, values, { client, establish: session.establish });
    if (notice === undefined) router.replace('/authenticated-entry');
    return notice ?? '';
  }
  if (flow === 'login') {
    return (
      <LoginScreen>
        {session.logoutNotice ? <Copy alert>{session.logoutNotice}</Copy> : null}
        <LoginForm submit={submit} />
      </LoginScreen>
    );
  }
  const definition = definitions[flow];
  return (
    <LoginScreen
      title={definition.title}
      description={descriptions[flow]}
      backDisabled={busy}
      privacy={flow !== 'activate'}
    >
      <View style={{ gap: m.xl }}>
        <FlowForm
          key={flow}
          fields={definition.fields}
          label={definition.label}
          submit={submit}
          Input={AuthInput}
          Label={AuthLabel}
          Action={AuthButton}
          onSubmittingChange={setBusy}
          formatError={authErrorMessage}
        />
        {flow === 'resend' ? (
          <AuthButton
            secondary
            disabled={busy}
            label="Verify email"
            onPress={() => router.push('/auth/verify')}
          />
        ) : null}
        {flow === 'verify' ? (
          <AuthButton
            secondary
            disabled={busy}
            label="Send another code"
            onPress={() => router.push('/auth/resend')}
          />
        ) : null}
        {flow === 'recover' ? (
          <AuthButton
            secondary
            disabled={busy}
            label="Enter reset code"
            onPress={() => router.push('/auth/reset')}
          />
        ) : null}
        {flow === 'reset' ? (
          <AuthButton
            secondary
            disabled={busy}
            label="Sign in"
            onPress={() => router.push('/auth/login')}
          />
        ) : null}
      </View>
    </LoginScreen>
  );
}
