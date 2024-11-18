import { z } from 'zod';
import {
  managementPageSchema,
  managerSummarySchema,
  managerCredentialInputSchema,
  type ManagementPage,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
import { setupPageQuery } from './owner-setup-body.js';
const pageSchema = z
  .object({
    data: z.array(managerSummarySchema).max(100),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict();
export async function listOwnerManagers(client: ApiClient, branchId: string, page: ManagementPage) {
  const id = z.string().uuid().parse(branchId);
  const result = await readApi(
    client.GET('/v1/manage/branches/{branchId}/managers', {
      params: { path: { branchId: id }, query: setupPageQuery(managementPageSchema.parse(page)) },
    }),
    pageSchema,
  );
  if (result.data.some((row) => row.branchId !== id)) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export function ownerCredentialForm(values: Record<string, string>, manual: boolean) {
  return managerCredentialInputSchema.parse({
    temporaryCredential: manual
      ? { mode: 'manual', password: values.temporaryPassword }
      : { mode: 'auto' },
  });
}
const transitionSchema = z
  .object({
    id: z.string().uuid(),
    branchId: z.string().uuid(),
    status: z.enum(['pending_activation', 'active', 'suspended', 'deactivated']),
  })
  .strict();
// AUTH-M-006 / MGR-004: removing a Manager (or cancelling a pending invitation) ends that
// assignment; irreversible, audited server-side, and confirmed with the Owner's password.
// The response must echo the same assignment.
export async function removeOwnerManager(
  client: ApiClient,
  branchId: string,
  assignmentId: string,
  currentPassword: string,
) {
  const branch = z.string().uuid().parse(branchId),
    assignment = z.string().uuid().parse(assignmentId);
  const result = await readApi(
    client.POST('/v1/manage/branches/{branchId}/managers/{assignmentId}/deactivate', {
      params: { path: { branchId: branch, assignmentId: assignment } },
      body: { currentPassword: z.string().min(1).max(128).parse(currentPassword) },
    }),
    transitionSchema,
  );
  if (result.id !== assignment || result.branchId !== branch || result.status !== 'deactivated')
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
