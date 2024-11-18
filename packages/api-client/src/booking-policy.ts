import { z } from 'zod';
import {
  bookingPolicyReadSchema,
  bookingPolicyVersionSchema,
  platformBookingSettingsSchema,
} from '@hsm/contracts';
import { bookingPolicyOverrideBody } from './booking-policy-input.js';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const targetSchema = z.discriminatedUnion('level', [
  z.object({ level: z.literal('platform') }).strict(),
  z.object({ level: z.literal('hostel'), id: identifier }).strict(),
  z.object({ level: z.literal('branch'), id: identifier }).strict(),
  z.object({ level: z.literal('room_type'), id: identifier, branchId: identifier }).strict(),
]);
function platformBody(body: unknown) {
  const input = platformBookingSettingsSchema.parse(body);
  return {
    policy: input.policy,
    limits: input.limits,
    ...(input.expectedCurrentVersionId !== undefined
      ? { expectedCurrentVersionId: input.expectedCurrentVersionId }
      : {}),
  };
}
export type BookingPolicyTarget = z.infer<typeof targetSchema>;
export type BookingPolicyRead = z.infer<typeof bookingPolicyReadSchema>;
function sameTarget(
  actual: { level: string; scopeId: string | null },
  target: BookingPolicyTarget,
) {
  if (
    actual.level !== target.level ||
    actual.scopeId !== (target.level === 'platform' ? null : target.id)
  )
    throw new ClientFailure('INVALID_RESPONSE');
}
export async function readBookingSettings(
  client: ApiClient,
  input: BookingPolicyTarget,
): Promise<BookingPolicyRead> {
  const target = targetSchema.parse(input);
  const operation =
    target.level === 'platform'
      ? client.GET('/v1/admin/booking-policy')
      : target.level === 'hostel'
        ? client.GET('/v1/owner/brands/{brandId}/booking-policy', {
            params: { path: { brandId: target.id } },
          })
        : target.level === 'branch'
          ? client.GET('/v1/branches/{branchId}/booking-policy', {
              params: { path: { branchId: target.id } },
            })
          : client.GET('/v1/branches/{branchId}/inventory/room-types/{roomTypeId}/booking-policy', {
              params: { path: { branchId: target.branchId, roomTypeId: target.id } },
            });
  const result = await readApi(operation, bookingPolicyReadSchema);
  sameTarget(result.target, target);
  if (result.configured && result.localVersion) sameTarget(result.localVersion, target);
  return result;
}
export async function saveBookingSettings(
  client: ApiClient,
  input: BookingPolicyTarget,
  body: unknown,
  key: string,
) {
  const target = targetSchema.parse(input),
    header = { 'Idempotency-Key': identifier.parse(key) };
  const operation =
    target.level === 'platform'
      ? client.PUT('/v1/admin/booking-policy', {
          params: { header },
          body: platformBody(body),
        })
      : target.level === 'hostel'
        ? client.PUT('/v1/owner/brands/{brandId}/booking-policy', {
            params: { path: { brandId: target.id }, header },
            body: bookingPolicyOverrideBody(body),
          })
        : target.level === 'branch'
          ? client.PUT('/v1/branches/{branchId}/booking-policy', {
              params: { path: { branchId: target.id }, header },
              body: bookingPolicyOverrideBody(body),
            })
          : client.PUT('/v1/branches/{branchId}/inventory/room-types/{roomTypeId}/booking-policy', {
              params: { path: { branchId: target.branchId, roomTypeId: target.id }, header },
              body: bookingPolicyOverrideBody(body),
            });
  const result = await readApi(operation, bookingPolicyVersionSchema);
  sameTarget(result, target);
  return result;
}
