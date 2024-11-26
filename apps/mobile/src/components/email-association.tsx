import { mobileSurfaces } from '@hsm/ui';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  requestEmailAssociation,
  verifyEmailAssociation,
  checkEmailAssociation,
} from '@hsm/api-client';
import type { SelfProfile } from '@hsm/contracts';
import { client } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { FlowForm } from './flow-form';
import { Button, Copy } from './ui';
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
      await complete(await checkEmailAssociation(client, userId, email));
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      setChecking(false);
    }
  }
  return (
    <View
      style={mobileSurfaces.icyCard}
      className="gap-5 rounded-panel border border-border bg-surface p-6 frosted-card"
    >
      <Copy>Verify an email for your account</Copy>
      <Copy>
        Keep your Manager account and add a verified email before completing Customer or Owner
        profiles. Your mobile number remains unverified.
      </Copy>
      {email ? (
        <>
          <Copy>
            If this email is available, a code has been sent. Enter it within ten minutes. Resends
            have a one-minute cooldown.
          </Copy>
          <FlowForm
            key="proof"
            disabled={checking}
            fields={[
              {
                name: 'code',
                numberFormat: 'plain',
                label: 'Email verification code',
                keyboard: 'number-pad',
              },
            ]}
            label="Verify email"
            submit={async (values) => {
              await complete(
                await verifyEmailAssociation(client, userId, email, values.code ?? ''),
              );
            }}
          />
          <Button
            disabled={checking}
            secondary
            label="Check verification status"
            onPress={() => {
              void check();
            }}
          />
          <Button
            disabled={checking}
            secondary
            label="Request a new code"
            onPress={() => {
              setEmail(undefined);
              setError(undefined);
            }}
          />
        </>
      ) : (
        <FlowForm
          key="request"
          fields={[
            { name: 'email', label: 'Email address', keyboard: 'email-address' },
            { name: 'currentPassword', label: 'Current password', secret: true },
          ]}
          label="Send verification code"
          submit={async (values) => {
            setEmail(await requestEmailAssociation(client, values));
          }}
        />
      )}
      {error ? <Copy alert>{error}</Copy> : null}
    </View>
  );
}
