import { z } from 'zod';
import {
  hostelRevisionCommandSchema,
  hostelRevisionDecisionSchema,
  hostelRevisionQueueQuerySchema,
  hostelRevisionQueueSchema,
  hostelRevisionReviewSchema,
  hostelRevisionSchema,
  hostelRevisionStateSchema,
  saveHostelRevisionSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
// CHG-041: Owner edits to an approved hostel wait for Admin re-verification while the live
// listing stays up. Every response must belong to the hostel or revision that was asked for.
const id = (value: unknown) => z.string().uuid().parse(value).toLowerCase();
const header = (key: string) => ({ 'Idempotency-Key': id(key) });
function sameHostel<T extends { live: { id: string } }>(value: T, brandId: string) {
  if (value.live.id !== brandId) throw new ClientFailure('INVALID_RESPONSE');
  return value;
}
export async function readHostelRevision(client: ApiClient, brand: unknown) {
  const brandId = id(brand);
  return sameHostel(
    await readApi(
      client.GET('/v1/owner/brands/{brandId}/revision', { params: { path: { brandId } } }),
      hostelRevisionStateSchema,
    ),
    brandId,
  );
}
export async function saveHostelRevision(
  client: ApiClient,
  brand: unknown,
  input: unknown,
  key: string,
) {
  const brandId = id(brand);
  return sameHostel(
    await readApi(
      client.PUT('/v1/owner/brands/{brandId}/revision', {
        params: { path: { brandId }, header: header(key) },
        body: saveHostelRevisionSchema.parse(input) as never,
      }),
      hostelRevisionStateSchema,
    ),
    brandId,
  );
}
export async function submitHostelRevision(
  client: ApiClient,
  brand: unknown,
  input: unknown,
  key: string,
) {
  const brandId = id(brand);
  return sameHostel(
    await readApi(
      client.POST('/v1/owner/brands/{brandId}/revision/submit', {
        params: { path: { brandId }, header: header(key) },
        body: hostelRevisionCommandSchema.parse(input) as never,
      }),
      hostelRevisionStateSchema,
    ),
    brandId,
  );
}
export async function withdrawHostelRevision(
  client: ApiClient,
  brand: unknown,
  input: unknown,
  key: string,
) {
  const brandId = id(brand);
  return sameHostel(
    await readApi(
      client.POST('/v1/owner/brands/{brandId}/revision/withdraw', {
        params: { path: { brandId }, header: header(key) },
        body: hostelRevisionCommandSchema.parse(input) as never,
      }),
      hostelRevisionStateSchema,
    ),
    brandId,
  );
}
export function listHostelRevisions(client: ApiClient, query: unknown = {}) {
  const parsed = hostelRevisionQueueQuerySchema.parse(query);
  return readApi(
    client.GET('/v1/admin/hostel-revisions', {
      params: {
        query: Object.fromEntries(
          Object.entries(parsed).filter(([, value]) => value !== undefined),
        ) as never,
      },
    }),
    hostelRevisionQueueSchema,
  );
}
export async function readHostelRevisionReview(client: ApiClient, revision: unknown) {
  const revisionId = id(revision);
  const review = await readApi(
    client.GET('/v1/admin/hostel-revisions/{revisionId}', {
      params: { path: { revisionId } },
    }),
    hostelRevisionReviewSchema,
  );
  if (review.revision.id !== revisionId || review.live.id !== review.revision.brandId)
    throw new ClientFailure('INVALID_RESPONSE');
  return review;
}
export async function decideHostelRevision(
  client: ApiClient,
  revision: unknown,
  input: unknown,
  key: string,
) {
  const revisionId = id(revision);
  const result = await readApi(
    client.POST('/v1/admin/hostel-revisions/{revisionId}/decision', {
      params: { path: { revisionId }, header: header(key) },
      body: hostelRevisionDecisionSchema.parse(input) as never,
    }),
    hostelRevisionSchema,
  );
  if (result.id !== revisionId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
