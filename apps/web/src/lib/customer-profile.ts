import { z } from 'zod';
import { readApi, type ApiClient } from '@hsm/api-client';
import { customerProfileInputSchema, selfProfileSchema } from '@hsm/contracts';
const form = z
  .object({
    fullName: z.string(),
    phone: z.string(),
    age: z.string().regex(/^\d{1,3}$/),
    gender: z.enum(['male', 'female']),
    institution: z.string(),
    profilePhotoFileId: z.string().uuid().optional(),
  })
  .strict();
export async function completeCustomerProfile(client: ApiClient, input: unknown) {
  const values = form.parse(input),
    institution = values.institution.trim();
  const parsed = customerProfileInputSchema.parse({
    fullName: values.fullName,
    phone: values.phone,
    age: Number(values.age),
    gender: values.gender,
    ...(institution ? { institution } : {}),
    ...(values.profilePhotoFileId ? { profilePhotoFileId: values.profilePhotoFileId } : {}),
  });
  const body = {
    fullName: parsed.fullName,
    phone: parsed.phone,
    age: parsed.age,
    gender: parsed.gender,
    ...(parsed.institution ? { institution: parsed.institution } : {}),
    ...(parsed.profilePhotoFileId ? { profilePhotoFileId: parsed.profilePhotoFileId } : {}),
  };
  const saved = await readApi(client.PUT('/v1/me/customer-profile', { body }), selfProfileSchema);
  const fresh = await readApi(client.GET('/v1/me'), selfProfileSchema);
  if (fresh.user.id !== saved.user.id || !fresh.capabilities.customer)
    throw new Error('Profile confirmation unavailable');
  return fresh;
}
