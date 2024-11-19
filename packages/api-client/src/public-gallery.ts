import { z } from 'zod';
import {
  publicGalleryPageSchema,
  publicGalleryQuerySchema,
  type PublicGalleryQuery,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export async function publicGallery(
  client: ApiClient,
  branchId: string,
  query: Partial<PublicGalleryQuery> = {},
) {
  const id = z.string().uuid().parse(branchId).toLowerCase();
  const input = publicGalleryQuerySchema.parse(query);
  const page = await readApi(
    client.GET('/v1/marketplace/{branchId}/gallery', {
      params: {
        path: { branchId: id },
        query: {
          limit: input.limit,
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        },
      },
    }),
    publicGalleryPageSchema,
  );
  if (page.branchId !== id) throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
