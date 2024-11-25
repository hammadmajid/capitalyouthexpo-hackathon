import { readApi, ClientFailure, type ApiClient } from '@hsm/api-client';
import { ownerProfileInputSchema, selfProfileSchema } from '@hsm/contracts';
export async function completeOwnerProfile(client: ApiClient, input: unknown) {
  const value = ownerProfileInputSchema.parse(input);
  const body = {
    fullName: value.fullName,
    phone: value.phone,
    cnic: value.cnic,
    ...(value.cnicFrontFileId ? { cnicFrontFileId: value.cnicFrontFileId } : {}),
    ...(value.cnicBackFileId ? { cnicBackFileId: value.cnicBackFileId } : {}),
    address: value.address,
    agreementAccepted: value.agreementAccepted,
    agreementVersion: value.agreementVersion,
    ...(value.organizationName ? { organizationName: value.organizationName } : {}),
    ...(value.profilePhotoFileId ? { profilePhotoFileId: value.profilePhotoFileId } : {}),
  };
  const saved = await readApi(client.PUT('/v1/me/owner-profile', { body }), selfProfileSchema);
  const fresh = await readApi(client.GET('/v1/me'), selfProfileSchema);
  if (fresh.user.id !== saved.user.id || !fresh.capabilities.owner)
    throw new ClientFailure('INVALID_RESPONSE');
  return fresh;
}
