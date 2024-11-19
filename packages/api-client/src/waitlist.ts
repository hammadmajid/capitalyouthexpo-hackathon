import { z } from 'zod';
import {
  joinWaitlistSchema,
  publicWaitlistOpenSchema,
  staffWaitlistPageSchema,
  waitlistEntrySchema,
  waitlistPageSchema,
  waitlistQuerySchema,
  type WaitlistEntry,
  type WaitlistQuery,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
function invalid(): never {
  throw new ClientFailure('INVALID_RESPONSE');
}
function page<T extends { data: WaitlistEntry[]; nextCursor: string | null }>(
  value: T,
  query: WaitlistQuery,
  branchId?: string,
): T {
  let cursor = query.cursor?.toLowerCase() ?? '';
  for (const row of value.data) {
    if (
      row.id <= cursor ||
      (branchId && row.branchId !== branchId) ||
      (query.roomTypeId && row.roomTypeId !== query.roomTypeId)
    )
      invalid();
    cursor = row.id;
  }
  if (
    value.data.length > query.limit ||
    (value.nextCursor !== null &&
      (value.data.length !== query.limit || value.nextCursor !== cursor))
  )
    invalid();
  return value;
}
function wireQuery(query: WaitlistQuery) {
  return {
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(query.roomTypeId ? { roomTypeId: query.roomTypeId } : {}),
  };
}
export async function listOwnWaitlist(client: ApiClient, input: unknown = {}) {
  const query = waitlistQuerySchema.parse(input);
  return page(
    await readApi(
      client.GET('/v1/me/waitlist', { params: { query: wireQuery(query) } }),
      waitlistPageSchema,
    ),
    query,
  );
}
export async function listBranchWaitlist(client: ApiClient, branch: string, input: unknown = {}) {
  const branchId = id.parse(branch),
    query = waitlistQuerySchema.parse(input);
  return page(
    await readApi(
      client.GET('/v1/branches/{branchId}/waitlist', {
        params: { path: { branchId }, query: wireQuery(query) },
      }),
      staffWaitlistPageSchema,
    ),
    query,
    branchId,
  );
}
export async function joinWaitlist(client: ApiClient, input: unknown, key: string) {
  const body = joinWaitlistSchema.parse(input),
    commandKey = id.parse(key);
  const result = await readApi(
    client.POST('/v1/me/waitlist', {
      body: {
        branchId: body.branchId,
        ...(body.roomTypeId ? { roomTypeId: body.roomTypeId } : {}),
      },
      params: { header: { 'Idempotency-Key': commandKey } },
    }),
    waitlistEntrySchema,
  );
  if (
    result.branchId !== body.branchId ||
    result.roomTypeId !== (body.roomTypeId ?? null) ||
    result.leftAt !== null
  )
    invalid();
  return result;
}
export async function leaveWaitlist(client: ApiClient, entry: string, key: string) {
  const entryId = id.parse(entry),
    commandKey = id.parse(key);
  const result = await readApi(
    client.DELETE('/v1/me/waitlist/{entryId}', {
      params: { path: { entryId }, header: { 'Idempotency-Key': commandKey } },
    }),
    waitlistEntrySchema,
  );
  if (result.id !== entryId || result.leftAt === null) invalid();
  return result;
}
// CHG-040: is a waiting list open for this hostel (a resident has given notice)? Public.
export async function readPublicWaitlistOpen(client: ApiClient, branch: unknown) {
  const branchId = id.parse(branch);
  return readApi(
    client.GET('/v1/marketplace/{branchId}/waitlist-open', {
      params: { path: { branchId } },
    }),
    publicWaitlistOpenSchema,
  );
}
