import { z } from 'zod';
import { readApi, type ApiClient } from '@hsm/api-client';
import { customerProfileInputSchema, selfProfileSchema, type SelfProfile } from '@hsm/contracts';
const form = z
  .object({
    fullName: z.string(),
    phone: z.string(),
    age: z.string().regex(/^\d{1,3}$/),
    gender: z.enum(['male', 'female']),
    institution: z.string(),
    profilePhotoFileId: z.string().uuid().nullable().optional(),
  })
  .strict();
export async function completeCustomerProfile(
  context: { client: ApiClient; refetch(): Promise<SelfProfile | undefined> },
  input: unknown,
) {
  const values = form.parse(input);
  const institution = values.institution.trim();
  const parsed = customerProfileInputSchema.parse({
    fullName: values.fullName,
    phone: values.phone,
    age: Number(values.age),
    gender: values.gender,
    ...(institution ? { institution } : {}),
    ...(values.profilePhotoFileId !== undefined
      ? { profilePhotoFileId: values.profilePhotoFileId }
      : {}),
  });
  const body = {
    fullName: parsed.fullName,
    phone: parsed.phone,
    age: parsed.age,
    gender: parsed.gender,
    ...(parsed.institution ? { institution: parsed.institution } : {}),
    ...(parsed.profilePhotoFileId !== undefined
      ? { profilePhotoFileId: parsed.profilePhotoFileId }
      : {}),
  };
  const saved = await readApi(
    context.client.PUT('/v1/me/customer-profile', { body }),
    selfProfileSchema,
  );
  // The active experience follows a fresh protected profile, never optimistic capability state.
  const fresh = await context.refetch();
  if (!fresh || fresh.user.id !== saved.user.id || !fresh.capabilities.customer)
    throw new Error('Profile confirmation unavailable');
  return fresh;
}
