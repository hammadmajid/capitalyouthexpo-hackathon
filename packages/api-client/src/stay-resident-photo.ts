import { stayIdentifierSchema, stayResidentPhotoSchema } from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { readApi } from './result.js';
export function readStayResidentPhoto(client: ApiClient, stay: string, branch?: string) {
  const stayId = stayIdentifierSchema.parse(stay);
  return readApi(
    branch
      ? client.GET('/v1/branches/{branchId}/stays/{stayId}/resident-photo', {
          params: { path: { branchId: stayIdentifierSchema.parse(branch), stayId } },
        })
      : client.GET('/v1/me/stays/{stayId}/resident-photo', { params: { path: { stayId } } }),
    stayResidentPhotoSchema,
  );
}
