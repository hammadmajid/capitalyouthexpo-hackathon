'use client';
import { enterApp } from '../../lib/enter-app';
import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  startRegistration,
  verifyRegistration,
  completeRegistration,
} from '../../lib/registration';
import { browserClient } from '../../lib/client';
import { loginDestination, authenticationPath } from '../../lib/return-path';
import { errorMessage } from '../../lib/messages';
import { FlowForm, type Field } from './flow-form';
import { Button } from '../ui/button';
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
    title: 'Enter your email',
    label: 'Send email code',
    fields: [{ name: 'email', label: 'Email address', type: 'email', autoComplete: 'email' }],
  },
  code: {
    title: 'Verify your email',
    label: 'Verify email',
    fields: [{ name: 'code', label: 'Six-digit email code', autoComplete: 'one-time-code' }],
  },
  password: {
    title: 'Set your password',
    label: 'Set password',
    fields: [
      { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
      {
        name: 'confirmPassword',
        label: 'Confirm password',
        type: 'password',
        autoComplete: 'new-password',
      },
    ],
  },
};
export function RegistrationForm({ returnPath }: { returnPath?: string | undefined }) {
  const cache = useQueryClient();
  // Verification authorizes password setup only; this capability never enters a URL or browser storage.
  const [step, setStep] = useState<Step>({ phase: 'email' });
  const [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<string>(),
    [error, setError] = useState<string>();
  const login = authenticationPath('login', returnPath);
  async function submit(input: Record<string, string>) {
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const client = browserClient();
      if (step.phase === 'email')
        setStep({ phase: 'code', email: await startRegistration(client, input) });
      else if (step.phase === 'code') {
        const result = await verifyRegistration(client, step.email, input.code ?? '');
        setStep(
          result.next === 'login'
            ? { phase: 'login' }
            : { phase: 'password', email: step.email, setupToken: result.setupToken },
        );
      } else if (step.phase === 'password') {
        const profile = await completeRegistration(client, step.setupToken, input);
        cache.clear();
        cache.setQueryData(['session'], profile);
        enterApp(loginDestination(returnPath, profile));
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
      await startRegistration(browserClient(), { email: step.email });
      setRevision((value) => value + 1);
      setNotice('A new email code has been requested.');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function restart() {
    setStep({ phase: 'email' });
    setError(undefined);
    setNotice(undefined);
  }
  if (step.phase === 'login')
    return (
      <div className="space-y-5">
        <p>This account already has a password. Sign in to continue.</p>
        <Link className="text-link" href={login}>
          Sign in
        </Link>
        <Button variant="secondary" onClick={restart}>
          Use another email
        </Button>
      </div>
    );
  const definition = definitions[step.phase];
  return (
    <div className="space-y-5">
      <h3 className="text-xl font-semibold text-hsm-heading">{definition.title}</h3>
      {step.phase !== 'email' ? <p className="text-sm text-hsm-secondary">{step.email}</p> : null}
      {step.phase === 'password' ? (
        <p>Choose a permanent password within ten minutes, or request a new email code.</p>
      ) : null}
      <FlowForm
        key={step.phase + revision}
        fields={definition.fields}
        label={definition.label}
        submit={submit}
      />
      {notice ? <p role="status">{notice}</p> : null}
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      {step.phase === 'code' ? (
        <Button variant="secondary" disabled={busy} onClick={() => void resend()}>
          Send another code
        </Button>
      ) : null}
      {step.phase !== 'email' ? (
        <Button variant="secondary" disabled={busy} onClick={restart}>
          Use another email
        </Button>
      ) : null}
      <Link className="text-link block text-sm" href={login}>
        Already have an account? Sign in
      </Link>
    </div>
  );
}
