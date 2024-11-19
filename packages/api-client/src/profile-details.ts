import { profileDetailsSchema } from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export async function readProfileDetails(client: ApiClient, expectedUserId: string) {
  const details = await readApi(client.GET('/v1/me/profile-details'), profileDetailsSchema);
  if (details.userId !== expectedUserId) throw new ClientFailure('INVALID_RESPONSE');
  return details;
}
