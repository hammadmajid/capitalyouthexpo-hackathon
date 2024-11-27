import { z } from 'zod';
import { readApi, type ApiClient } from '@hsm/api-client';
import {
  emailRequestSchema,
  emailVerificationSessionSchema,
  loginSchema,
  managerActivationSchema,
  pakistaniMobileSchema,
  passwordResetSchema,
  registrationSchema,
} from '@hsm/contracts';
import { mobileLoginSchema } from './session';
import type { MobileSession } from './vault';
export const flowSchema = z.enum([
  'login',
  'register',
  'verify',
  'resend',
  'recover',
  'reset',
  'activate',
]);
export type AuthFlowName = z.infer<typeof flowSchema>;
interface AuthenticationContext {
  client: ApiClient;
  establish(work: () => Promise<MobileSession>): Promise<unknown>;
}
// AUTH-M-003: the Owner invites 03…/+92… numbers; activation sends the same +92 form.
function invitedPhone(input: string) {
  const parsed = pakistaniMobileSchema.safeParse(input.replace(/[\s-]/g, ''));
  return parsed.success ? parsed.data : input;
}
function credentials(value: z.infer<typeof mobileLoginSchema>): MobileSession {
  return {
    client: value.client,
    expiresIn: value.expiresIn,
    sessionId: value.sessionId,
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
  };
}
async function authenticate(
  flow: 'login' | 'verify' | 'activate',
  values: Record<string, string>,
  client: ApiClient,
) {
  switch (flow) {
    case 'verify':
      return credentials(
        await readApi(
          client.POST('/v1/auth/email/verify', {
            body: emailVerificationSessionSchema.parse({ ...values, client: 'mobile' }),
          }),
          mobileLoginSchema,
        ),
      );
    case 'activate':
      return credentials(
        await readApi(
          client.POST('/v1/auth/manager/activate', {
            body: managerActivationSchema.parse({
              ...values,
              phone: invitedPhone(values.phone ?? ''),
              client: 'mobile',
            }),
          }),
          mobileLoginSchema,
        ),
      );
    case 'login':
      return credentials(
        await readApi(
          client.POST('/v1/auth/login', {
            body: loginSchema.parse({ ...values, client: 'mobile' }),
          }),
          mobileLoginSchema,
        ),
      );
  }
}
export async function runAuth(
  flow: AuthFlowName,
  values: Record<string, string>,
  context: AuthenticationContext,
) {
  const client = context.client;
  switch (flow) {
    case 'login':
    case 'verify':
    case 'activate':
      await context.establish(() => authenticate(flow, values, client));
      return undefined;
    case 'register':
      await readApi(
        client.POST('/v1/auth/register', { body: registrationSchema.parse(values) }),
        z.object({ verificationRequired: z.literal(true) }).strict(),
      );
      return 'Check your email for a code, then verify your account.';
    case 'resend':
      await readApi(
        client.POST('/v1/auth/email/resend', { body: emailRequestSchema.parse(values) }),
        z.object({ verificationRequired: z.literal(true) }).strict(),
      );
      return 'If verification is available, a code will arrive by email.';
    case 'recover':
      await readApi(
        client.POST('/v1/auth/password/forgot', { body: emailRequestSchema.parse(values) }),
        z.object({ accepted: z.literal(true) }).strict(),
      );
      return 'If this account can reset its password, a code will arrive by email.';
    case 'reset':
      await readApi(
        client.POST('/v1/auth/password/reset', { body: passwordResetSchema.parse(values) }),
        z.object({ reset: z.literal(true) }).strict(),
      );
      return 'Password reset. Sign in with your new password.';
  }
}
