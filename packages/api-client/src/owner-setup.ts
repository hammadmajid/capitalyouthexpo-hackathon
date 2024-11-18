import { setupBasicsBody, setupMainBody, setupPageQuery } from './owner-setup-body.js';
import { z } from 'zod';
import {
  organizationSummarySchema,
  managementPageSchema,
  hostelPageSchema,
  hostelOnboardingSchema,
  cityPageSchema,
  areaPageSchema,
  areaPageInputSchema,
  hostelBasicsInputSchema,
  mainBranchDraftInputSchema,
  hostelOnboardingStateSchema,
  managerInvitationInputSchema,
  managerCredentialInputSchema,
  managerInvitationResponseSchema,
  type ManagementPage,
  type AreaPageInput,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const identifier = z.string().uuid();
const organizationPageSchema = z
  .object({ data: z.array(organizationSummarySchema).max(100), nextCursor: identifier.nullable() })
  .strict();
export async function listOwnerOrganizations(client: ApiClient, page: ManagementPage) {
  return readApi(
    client.GET('/v1/owner/organizations', {
      params: { query: setupPageQuery(managementPageSchema.parse(page)) },
    }),
    organizationPageSchema,
  );
}
export async function listOwnerHostels(
  client: ApiClient,
  organizationId: string,
  page: ManagementPage,
) {
  const result = await readApi(
    client.GET('/v1/owner/organizations/{orgId}/brands', {
      params: {
        path: { orgId: identifier.parse(organizationId) },
        query: setupPageQuery(managementPageSchema.parse(page)),
      },
    }),
    hostelPageSchema,
  );
  if (result.data.some((row) => row.organizationId !== organizationId))
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function readOwnerHostel(client: ApiClient, brandId: string) {
  const result = await readApi(
    client.GET('/v1/owner/brands/{brandId}/onboarding', {
      params: { path: { brandId: identifier.parse(brandId) } },
    }),
    hostelOnboardingSchema,
  );
  if (result.id !== brandId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export function listOwnerCities(client: ApiClient, page: ManagementPage) {
  return readApi(
    client.GET('/v1/owner/geography/cities', {
      params: { query: setupPageQuery(managementPageSchema.parse(page)) },
    }),
    cityPageSchema,
  );
}
export async function listOwnerAreas(client: ApiClient, cityId: string, page: AreaPageInput) {
  const input = areaPageInputSchema.parse(page);
  const result = await readApi(
    client.GET('/v1/owner/geography/cities/{cityId}/areas', {
      params: {
        path: { cityId: identifier.parse(cityId) },
        query: {
          ...setupPageQuery(input),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        },
      },
    }),
    areaPageSchema,
  );
  if (
    result.data.some(
      (row) =>
        row.cityId !== cityId ||
        (input.parentId
          ? row.parentId !== input.parentId || row.level !== 'sub_area'
          : row.level === 'sub_area'),
    )
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
// Ephemeral keys survive an uncertain response for the same operation/input.
// The UI owns this instance for one signed-in setup flow; nothing is persisted.
export function ownerSetupActions(client: ApiClient, randomKey: () => string) {
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
  function complete(operation: string, key: string) {
    if (intents.get(operation)?.key === key) intents.delete(operation);
  }
  async function create(organizationId: string, body: unknown) {
    const input = hostelBasicsInputSchema.parse(body),
      orgId = identifier.parse(organizationId);
    const result = await readApi(
      client.POST('/v1/owner/organizations/{orgId}/brands', {
        params: { path: { orgId }, header: headers('create:' + orgId, input) },
        body: setupBasicsBody(input),
      }),
      hostelOnboardingStateSchema,
    );
    if (result.organizationId !== orgId) throw new ClientFailure('INVALID_RESPONSE');
    return result;
  }
  async function basics(brandId: string, body: unknown) {
    const input = hostelBasicsInputSchema.parse(body),
      id = identifier.parse(brandId);
    const result = await readApi(
      client.PUT('/v1/owner/brands/{brandId}/basics', {
        params: { path: { brandId: id }, header: headers('basics:' + id, input) },
        body: setupBasicsBody(input),
      }),
      hostelOnboardingStateSchema,
    );
    if (result.id !== id) throw new ClientFailure('INVALID_RESPONSE');
    return result;
  }
  async function main(brandId: string, body: unknown) {
    const input = mainBranchDraftInputSchema.parse(body),
      id = identifier.parse(brandId);
    const result = await readApi(
      client.PUT('/v1/owner/brands/{brandId}/main-branch', {
        params: { path: { brandId: id }, header: headers('main:' + id, input) },
        body: setupMainBody(input),
      }),
      hostelOnboardingStateSchema,
    );
    if (result.id !== id) throw new ClientFailure('INVALID_RESPONSE');
    return result;
  }
  async function submit(brandId: string) {
    const id = identifier.parse(brandId);
    const result = await readApi(
      client.POST('/v1/owner/brands/{brandId}/submit', {
        params: { path: { brandId: id }, header: headers('submit:' + id, {}) },
        body: {},
      }),
      hostelOnboardingStateSchema,
    );
    if (result.id !== id) throw new ClientFailure('INVALID_RESPONSE');
    return result;
  }
  async function invite(branchId: string, body: unknown) {
    const id = identifier.parse(branchId),
      input = managerInvitationInputSchema.parse(body),
      operation = 'invite:' + id,
      header = headers(operation, input);
    const result = await readApi(
      client.POST('/v1/manage/branches/{branchId}/managers', {
        params: { path: { branchId: id }, header },
        body: input,
      }),
      managerInvitationResponseSchema,
    );
    if (result.branchId !== id) throw new ClientFailure('INVALID_RESPONSE');
    complete(operation, header['Idempotency-Key']);
    return result;
  }
  async function resetInvitation(branchId: string, assignmentId: string, body: unknown) {
    const id = identifier.parse(branchId),
      assignment = identifier.parse(assignmentId),
      input = managerCredentialInputSchema.parse(body),
      operation = 'reset:' + id + ':' + assignment,
      header = headers(operation, input);
    const result = await readApi(
      client.POST('/v1/manage/branches/{branchId}/managers/{assignmentId}/reset-temp-password', {
        params: {
          path: { branchId: id, assignmentId: assignment },
          header,
        },
        body: input,
      }),
      managerInvitationResponseSchema,
    );
    if (result.branchId !== id || result.id !== assignment)
      throw new ClientFailure('INVALID_RESPONSE');
    complete(operation, header['Idempotency-Key']);
    return result;
  }
  function forgetInvitation(branchId: string) {
    intents.delete('invite:' + identifier.parse(branchId));
  }
  function forgetInvitationReset(branchId: string) {
    const id = identifier.parse(branchId);
    for (const operation of intents.keys())
      if (operation.startsWith('reset:' + id + ':')) intents.delete(operation);
  }
  return {
    create,
    basics,
    main,
    submit,
    invite,
    resetInvitation,
    forgetInvitation,
    forgetInvitationReset,
  };
}
export type OwnerSetupActions = ReturnType<typeof ownerSetupActions>;
