import { z } from 'zod';
import { listingRuleCursorSchema } from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { marketplaceDetails } from './marketplace.js';
import { listPublicInventoryRoomTypes } from './public-inventory-pages.js';
import { listPublicListingRules } from './listing-rules.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const publicShareQuerySchema = z
  .object({
    roomCursor: id.optional(),
    ruleCursor: listingRuleCursorSchema.optional(),
  })
  .strict();
export function publicHostelShareUrl(webOrigin: string, branchId: string) {
  const origin = z.string().url().parse(webOrigin),
    url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
    throw new Error('Invalid public web origin');
  return url.origin + '/share/' + id.parse(branchId);
}
export async function readPublicHostelSummary(
  client: ApiClient,
  branchId: string,
  query: unknown = {},
) {
  const branch = id.parse(branchId),
    page = publicShareQuerySchema.parse(query);
  const [listing, rooms, rules] = await Promise.all([
    marketplaceDetails(client, branch),
    listPublicInventoryRoomTypes(client, branch, {
      limit: 20,
      ...(page.roomCursor ? { cursor: page.roomCursor } : {}),
    }),
    listPublicListingRules(client, branch, {
      limit: 20,
      ...(page.ruleCursor ? { cursor: page.ruleCursor } : {}),
    }),
  ]);
  return { listing, rooms, rules };
}
