'use client';
import { enterApp } from '../../lib/enter-app';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  emailRequestSchema,
  emailVerificationSessionSchema,
  managerActivationSchema,
  passwordResetSchema,
} from '@hsm/contracts';
import { readApi } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { webLoginSchema } from '../../lib/session';
import { FlowForm, type Field } from './flow-form';
const email: Field = {
  name: 'email',
  label: 'Email address',
  type: 'email',
  autoComplete: 'email',
};
const code: Field = { name: 'code', label: 'Six-digit email code', autoComplete: 'one-time-code' };
const newPassword: Field = {
  name: 'newPassword',
  label: 'New password',
  type: 'password',
  autoComplete: 'new-password',
};
export function VerifyForm() {
  const cache = useQueryClient();
  return (
    <FlowForm
      label="Verify email"
      fields={[email, code]}
      submit={async (values) => {
        const body = emailVerificationSessionSchema.parse({ ...values, client: 'web' });
        const profile = await readApi(
          browserClient().POST('/v1/auth/email/verify', { body }),
          webLoginSchema,
        );
        cache.clear();
        cache.setQueryData(['session'], { user: profile.user, capabilities: profile.capabilities });
        enterApp('/app');
      }}
    />
  );
}
export function ResendForm() {
  return (
    <FlowForm
      label="Send another code"
      fields={[email]}
      submit={async (values) => {
        await readApi(
          browserClient().POST('/v1/auth/email/resend', { body: emailRequestSchema.parse(values) }),
          z.object({ verificationRequired: z.literal(true) }).strict(),
        );
        return 'If verification is available for this account, a code will arrive by email.';
      }}
    />
  );
}
export function RecoverForm() {
  return (
    <FlowForm
      label="Send reset code"
      fields={[email]}
      submit={async (values) => {
        await readApi(
          browserClient().POST('/v1/auth/password/forgot', {
            body: emailRequestSchema.parse(values),
          }),
          z.object({ accepted: z.literal(true) }).strict(),
        );
        return 'If this account can reset its password, a code will arrive by email.';
      }}
    />
  );
}
export function ResetForm() {
  const cache = useQueryClient();
  return (
    <FlowForm
      label="Reset password"
      fields={[email, code, newPassword]}
      submit={async (values) => {
        await readApi(
          browserClient().POST('/v1/auth/password/reset', {
            body: passwordResetSchema.parse(values),
          }),
          z.object({ reset: z.literal(true) }).strict(),
        );
        cache.clear();
        return 'Your password has been reset. Sign in with your new password.';
      }}
    />
  );
}
export function ActivateForm() {
  const cache = useQueryClient();
  return (
    <FlowForm
      label="Activate account"
      fields={[
        {
          name: 'phone',
          label: 'Invited mobile number (+92)',
          type: 'tel',
          autoComplete: 'username',
        },
        {
          name: 'tempPassword',
          label: 'Temporary password',
          type: 'password',
          autoComplete: 'current-password',
        },
        newPassword,
      ]}
      submit={async (values) => {
        const body = managerActivationSchema.parse({ ...values, client: 'web' });
        const profile = await readApi(
          browserClient().POST('/v1/auth/manager/activate', { body }),
          webLoginSchema,
        );
        cache.clear();
        cache.setQueryData(['session'], { user: profile.user, capabilities: profile.capabilities });
        enterApp('/app');
      }}
    />
  );
}
