import { z } from 'zod';
import {
  emailAssociationRequestSchema,
  emailAssociationVerificationSchema,
  selfProfileSchema,
  type SelfProfile,
} from '@hsm/contracts';
import { createApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
type Client = ReturnType<typeof createApiClient>;
export function canAssociateEmail(profile: SelfProfile) {
  return (
    profile.user.email === null &&
    !profile.user.emailVerified &&
    profile.capabilities.managerOf.length > 0
  );
}
function sameIdentity(profile: SelfProfile, userId: string, email: string) {
  if (profile.user.id !== userId || profile.user.email !== email || !profile.user.emailVerified)
    throw new ClientFailure('INVALID_RESPONSE');
  return profile;
}
export async function requestEmailAssociation(client: Client, values: Record<string, string>) {
  const body = emailAssociationRequestSchema.parse({
    email: values.email?.trim(),
    currentPassword: values.currentPassword,
  });
  await readApi(
    client.POST('/v1/auth/email/associate', { body }),
    z.object({ accepted: z.literal(true) }).strict(),
  );
  return body.email;
}
export async function verifyEmailAssociation(
  client: Client,
  userId: string,
  email: string,
  code: string,
) {
  z.string().uuid().parse(userId);
  const body = emailAssociationVerificationSchema.parse({ email, code });
  return sameIdentity(
    await readApi(client.POST('/v1/auth/email/associate/verify', { body }), selfProfileSchema),
    userId,
    body.email,
  );
}
export async function checkEmailAssociation(client: Client, userId: string, email: string) {
  z.string().uuid().parse(userId);
  const target = emailAssociationRequestSchema.shape.email.parse(email);
  return sameIdentity(await readApi(client.GET('/v1/me'), selfProfileSchema), userId, target);
}
