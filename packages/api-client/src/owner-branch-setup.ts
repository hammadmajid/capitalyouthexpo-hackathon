import { z } from 'zod';
import {
  hostelOnboardingSchema,
  hostelOnboardingStateSchema,
  mainBranchDraftInputSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { setupMainBody } from './owner-setup-body.js';
import { ClientFailure, readApi } from './result.js';
const identifier = z.string().uuid();
// BRN-001: additional branch setup under an owned hostel. The read reuses the hostel setup
// shape; its mainBranch field is the selected branch.
export async function readOwnerBranchSetup(client: ApiClient, brandId: string, branchId: string) {
  const result = await readApi(
    client.GET('/v1/owner/brands/{brandId}/branches/{branchId}/onboarding', {
      params: {
        path: { brandId: identifier.parse(brandId), branchId: identifier.parse(branchId) },
      },
    }),
    hostelOnboardingSchema,
  );
  if (result.id !== brandId || result.mainBranch?.id !== branchId)
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
// Same ephemeral-key rule as ownerSetupActions: an uncertain retry reuses its key.
export function ownerBranchSetupActions(client: ApiClient, randomKey: () => string) {
  const intents = new Map<string, { input: string; key: string }>();
  function headers(operation: string, input: unknown) {
    const fingerprint = JSON.stringify(input),
      previous = intents.get(operation);
    const intent =
      previous?.input === fingerprint
        ? previous
        : { input: fingerprint, key: identifier.parse(randomKey()) };
    intents.set(operation, intent);
    return { 'Idempotency-Key': intent.key };
  }
  async function add(brandId: string, body: unknown) {
    const input = mainBranchDraftInputSchema.parse(body),
      id = identifier.parse(brandId);
    const result = await readApi(
      client.POST('/v1/owner/brands/{brandId}/branches', {
        params: { path: { brandId: id }, header: headers('add:' + id, input) },
        body: setupMainBody(input),
      }),
      hostelOnboardingStateSchema,
    );
    if (result.id !== id || !result.mainBranchId) throw new ClientFailure('INVALID_RESPONSE');
    return result;
  }
  async function save(brandId: string, branchId: string, body: unknown) {
    const input = mainBranchDraftInputSchema.parse(body),
      path = { brandId: identifier.parse(brandId), branchId: identifier.parse(branchId) };
    const result = await readApi(
      client.PUT('/v1/owner/brands/{brandId}/branches/{branchId}', {
        params: { path, header: headers('save:' + path.branchId, input) },
        body: setupMainBody(input),
      }),
      hostelOnboardingStateSchema,
    );
    if (result.id !== path.brandId || result.mainBranchId !== path.branchId)
      throw new ClientFailure('INVALID_RESPONSE');
    return result;
  }
  async function submit(brandId: string, branchId: string) {
    const path = { brandId: identifier.parse(brandId), branchId: identifier.parse(branchId) };
    const result = await readApi(
      client.POST('/v1/owner/brands/{brandId}/branches/{branchId}/submit', {
        params: { path, header: headers('submit:' + path.branchId, {}) },
        body: {},
      }),
      hostelOnboardingStateSchema,
    );
    if (result.id !== path.brandId || result.mainBranchId !== path.branchId)
      throw new ClientFailure('INVALID_RESPONSE');
    return result;
  }
  return { add, save, submit };
}
