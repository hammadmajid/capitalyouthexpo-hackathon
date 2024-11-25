'use client';
import { useEffect, useRef, useState } from 'react';
import {
  requestEmailAssociation,
  verifyEmailAssociation,
  checkEmailAssociation,
} from '@hsm/api-client';
import type { SelfProfile } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { FlowForm } from './auth/flow-form';
import { Button } from './ui/button';
export function EmailAssociation({
  userId,
  onVerified,
}: {
  userId: string;
  onVerified: (profile: SelfProfile) => Promise<void>;
}) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function complete(profile: SelfProfile) {
    if (mounted.current) await onVerified(profile);
  }
  const [email, setEmail] = useState<string>(),
    [error, setError] = useState<string>(),
    [checking, setChecking] = useState(false);
  async function check() {
    if (!email) return;
    setChecking(true);
    setError(undefined);
    try {
      await complete(await checkEmailAssociation(browserClient(), userId, email));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setChecking(false);
    }
  }
  return (
    <section
      className="max-w-xl space-y-5 rounded-panel border border-hsm-border bg-hsm-surface p-6"
      aria-label="Verify an email for your account"
    >
      <h2 className="text-2xl font-bold text-hsm-heading">Verify an email for your account</h2>
      <p>
        Keep your Manager account and add a verified email before completing Customer or Owner
        profiles. Your mobile number remains unverified.
      </p>
      {email ? (
        <>
          <p>
            If this email is available, a code has been sent. Enter it within ten minutes. Resends
            have a one-minute cooldown.
          </p>
          <FlowForm
            key="proof"
            disabled={checking}
            fields={[
              { name: 'code', label: 'Email verification code', autoComplete: 'one-time-code' },
            ]}
            label="Verify email"
            submit={async (values) => {
              await complete(
                await verifyEmailAssociation(browserClient(), userId, email, values.code ?? ''),
              );
            }}
          />
          <Button
            disabled={checking}
            variant="secondary"
            onClick={() => {
              void check();
            }}
          >
            Check verification status
          </Button>
          <Button
            disabled={checking}
            variant="secondary"
            onClick={() => {
              setEmail(undefined);
              setError(undefined);
            }}
          >
            Request a new code
          </Button>
        </>
      ) : (
        <FlowForm
          key="request"
          fields={[
            { name: 'email', label: 'Email address', type: 'email', autoComplete: 'email' },
            {
              name: 'currentPassword',
              label: 'Current password',
              type: 'password',
              autoComplete: 'current-password',
            },
          ]}
          label="Send verification code"
          submit={async (values) => {
            setEmail(await requestEmailAssociation(browserClient(), values));
          }}
        />
      )}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
