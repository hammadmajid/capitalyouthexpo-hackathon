import { z } from 'zod';
import { readApi, type ApiClient } from '@hsm/api-client';
import {
  registrationStartSchema,
  registrationVerifySchema,
  registrationPasswordSchema,
  registrationVerificationResultSchema,
  passwordSchema,
  selfProfileSchema,
} from '@hsm/contracts';
import { webLoginSchema } from './session';
const confirmation = z
  .object({ password: passwordSchema, confirmPassword: passwordSchema })
  .strict()
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match',
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
export async function completeRegistration(client: ApiClient, setupToken: string, input: unknown) {
  const values = confirmation.parse(input);
  const body = registrationPasswordSchema.parse({
    setupToken,
    password: values.password,
    client: 'web',
  });
  const established = await readApi(
    client.POST('/v1/auth/registration/password', { body }),
    webLoginSchema,
  );
  // Cookies are HTTP-only. The setup capability is never a bearer/session credential.
  const fresh = await readApi(client.GET('/v1/me'), selfProfileSchema);
  if (fresh.user.id !== established.user.id) throw new Error('Profile confirmation unavailable');
  return fresh;
}
