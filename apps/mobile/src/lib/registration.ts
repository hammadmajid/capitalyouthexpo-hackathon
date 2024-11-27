import { z } from 'zod';
import { readApi, type ApiClient } from '@hsm/api-client';
import {
  registrationStartSchema,
  registrationVerifySchema,
  registrationPasswordSchema,
  registrationVerificationResultSchema,
  passwordSchema,
} from '@hsm/contracts';
import { mobileLoginSchema } from './session';
import type { MobileSession } from './vault';
const confirmation = z
  .object({
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .strict()
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  });
export async function startRegistration(client: ApiClient, input: unknown) {
  const body = registrationStartSchema.parse(input);
  await readApi(
    client.POST('/v1/auth/registration/start', { body }),
    z.object({ verificationRequired: z.literal(true) }).strict(),
  );
  return body.email;
}
export function verifyRegistration(client: ApiClient, email: string, code: string) {
  const body = registrationVerifySchema.parse({ email, code });
  return readApi(
    client.POST('/v1/auth/registration/verify', { body }),
    registrationVerificationResultSchema,
  );
}
export async function completeRegistration(
  context: { client: ApiClient; establish(work: () => Promise<MobileSession>): Promise<unknown> },
  setupToken: string,
  input: unknown,
) {
  const values = confirmation.parse(input);
  const body = registrationPasswordSchema.parse({
    setupToken,
    password: values.password,
    client: 'mobile',
  });
  // AUTH-C CHG-006: session persistence occurs only after permanent password setup.
  // The existing provider then reads a fresh profile before entering protected UI.
  return context.establish(async () => {
    const response = await readApi(
      context.client.POST('/v1/auth/registration/password', { body }),
      mobileLoginSchema,
    );
    return {
      client: response.client,
      expiresIn: response.expiresIn,
      sessionId: response.sessionId,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    };
  });
}
