import { useState } from 'react';
import { View } from 'react-native';
import { natureLoginMetrics as m } from '@hsm/ui';
import { router } from 'expo-router';
import { startRegistration, verifyRegistration, completeRegistration } from '../lib/registration';
import { client } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { useSession } from './providers';
import { FlowForm, type Field } from './flow-form';
import { Copy } from './ui';
import { LoginScreen } from './login-screen';
import { AuthButton, AuthEmailBadge, AuthInput, AuthLabel } from './auth-form-ui';
type Step =
  | { phase: 'email' }
  | { phase: 'code'; email: string }
  | { phase: 'password'; email: string; setupToken: string }
  | { phase: 'login' };
const definitions: Record<
  'email' | 'code' | 'password',
  { title: string; label: string; fields: readonly Field[] }
> = {
  email: {
    title: 'Create your account',
    label: 'Send email code',
    fields: [{ name: 'email', label: 'Email address', keyboard: 'email-address' }],
  },
  code: {
    title: 'Verify your email',
    label: 'Verify email',
    fields: [
      {
        name: 'code',
        numberFormat: 'plain',
        label: 'Six-digit email code',
        keyboard: 'number-pad',
      },
    ],
  },
  password: {
    title: 'Set your password',
    label: 'Set password',
    fields: [
      { name: 'password', label: 'Password', secret: true },
      { name: 'confirmPassword', label: 'Confirm password', secret: true },
    ],
  },
};
export function RegistrationFlow() {
  const session = useSession();
  // The short-lived setup capability stays in memory, never URLs or device storage.
  const [step, setStep] = useState<Step>({ phase: 'email' });
  const [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<string>(),
    [error, setError] = useState<string>();
  async function submit(values: Record<string, string>) {
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      if (step.phase === 'email') {
        const email = await startRegistration(client, values);
        setStep({ phase: 'code', email });
      } else if (step.phase === 'code') {
        const result = await verifyRegistration(client, step.email, values.code ?? '');
        setStep(
          result.next === 'login'
            ? { phase: 'login' }
            : {
                phase: 'password',
                email: step.email,
                setupToken: result.setupToken,
              },
        );
      } else if (step.phase === 'password') {
        await completeRegistration(
          { client, establish: session.establish },
          step.setupToken,
          values,
        );
        router.replace('/customer-profile');
      }
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (step.phase !== 'code' || busy) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await startRegistration(client, { email: step.email });
      setRevision((value) => value + 1);
      setNotice('A new email code has been requested.');
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function restart() {
    setStep({ phase: 'email' });
    setNotice(undefined);
    setError(undefined);
  }
  if (step.phase === 'login')
    return (
      <LoginScreen title="Sign in to your account">
        <View style={{ gap: m.xl }}>
          <Copy>This account already has a password. Sign in to continue.</Copy>
          <AuthButton label="Sign in" onPress={() => router.replace('/auth/login')} />
          <AuthButton secondary label="Use another email" onPress={restart} />
        </View>
      </LoginScreen>
    );
  const definition = definitions[step.phase];
  return (
    <LoginScreen
      title={definition.title}
      backDisabled={busy}
      privacy={step.phase !== 'code'}
      description={
        step.phase === 'email'
          ? 'Enter your email to begin.'
          : step.phase === 'code'
            ? 'Enter the 6-digit code sent to you.'
            : 'Choose a permanent password within ten minutes, or request a new email code.'
      }
    >
      {step.phase !== 'email' ? <AuthEmailBadge email={step.email} /> : null}
      <View style={{ gap: m.xl }}>
        <FlowForm
          key={step.phase + revision}
          fields={definition.fields}
          label={definition.label}
          submit={submit}
          Input={AuthInput}
          Label={AuthLabel}
          Action={AuthButton}
          disabled={busy}
        />
        {notice ? <Copy>{notice}</Copy> : null}
        {error ? <Copy alert>{error}</Copy> : null}
        {step.phase === 'code' ? (
          <AuthButton
            secondary
            label="Send another code"
            disabled={busy}
            onPress={() => {
              void resend();
            }}
          />
        ) : null}
        {step.phase !== 'email' ? (
          <AuthButton secondary label="Use another email" disabled={busy} onPress={restart} />
        ) : null}
      </View>
    </LoginScreen>
  );
}
