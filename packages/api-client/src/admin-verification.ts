import {
  downloadResponseSchema,
  stayIdentifierSchema as id,
  verificationCommandInputSchema,
  verificationDossierSchema,
  verificationEvidenceAccessSchema,
  verificationHistorySchema,
  verificationPageQuerySchema,
  verificationQueueItemSchema,
  verificationPhotosSchema,
  verificationPricingSchema,
  verificationSnapshotComparisonSchema,
  verificationSnapshotItemsSchema,
  verificationSnapshotItemQuerySchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { readApi } from './result.js';
export function readVerificationSnapshots(client: ApiClient, branchId: unknown) {
  return readApi(
    client.GET('/v1/admin/verifications/{branchId}/submissions', {
      params: { path: { branchId: id.parse(branchId) } },
    }),
    verificationSnapshotComparisonSchema,
  );
}
export function readVerificationSnapshotItems(
  client: ApiClient,
  branchId: unknown,
  submissionId: unknown,
  query: unknown,
) {
  const input = verificationSnapshotItemQuerySchema.parse(query);
  return readApi(
    client.GET('/v1/admin/verifications/{branchId}/submissions/{submissionId}/items', {
      params: {
        path: { branchId: id.parse(branchId), submissionId: id.parse(submissionId) },
        query: {
          kind: input.kind,
          limit: input.limit,
          ...(input.cursor ? { cursor: input.cursor } : {}),
        },
      },
    }),
    verificationSnapshotItemsSchema,
  );
}
export function readVerificationDossier(client: ApiClient, branchId: unknown) {
  return readApi(
    client.GET('/v1/admin/verifications/{branchId}', {
      params: { path: { branchId: id.parse(branchId) } },
    }),
    verificationDossierSchema,
  );
}
export function readVerificationHistory(client: ApiClient, branchId: unknown, query: unknown = {}) {
  const input = verificationPageQuerySchema.parse(query);
  return readApi(
    client.GET('/v1/admin/verifications/{branchId}/history', {
      params: {
        path: { branchId: id.parse(branchId) },
        query: { limit: input.limit, ...(input.cursor ? { cursor: input.cursor } : {}) },
      },
    }),
    verificationHistorySchema,
  );
}
// Sensitive access is an explicit POST with no replay key or automatic retry.
export function readVerificationEvidence(
  client: ApiClient,
  branchId: unknown,
  fileId: unknown,
  input: unknown,
) {
  return readApi(
    client.POST('/v1/admin/verifications/{branchId}/evidence/{fileId}/access', {
      params: { path: { branchId: id.parse(branchId), fileId: id.parse(fileId) } },
      body: verificationEvidenceAccessSchema.parse(input),
    }),
    downloadResponseSchema,
  );
}
export function submitVerificationDecision(
  client: ApiClient,
  branchId: unknown,
  input: unknown,
  key: unknown,
) {
  const parsed = verificationCommandInputSchema.parse(input);
  return readApi(
    client.POST('/v1/admin/verifications/{branchId}', {
      params: {
        path: { branchId: id.parse(branchId) },
        header: { 'Idempotency-Key': id.parse(key) },
      },
      body: {
        action: parsed.action,
        ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
        ...(parsed.expectedStatus !== undefined ? { expectedStatus: parsed.expectedStatus } : {}),
        ...(parsed.expectedUpdatedAt !== undefined
          ? { expectedUpdatedAt: parsed.expectedUpdatedAt }
          : {}),
      },
    }),
    verificationQueueItemSchema,
  );
}
export function readVerificationPricing(client: ApiClient, branchId: unknown, query: unknown = {}) {
  const input = verificationPageQuerySchema.parse(query);
  return readApi(
    client.GET('/v1/admin/verifications/{branchId}/pricing', {
      params: {
        path: { branchId: id.parse(branchId) },
        query: { limit: input.limit, ...(input.cursor ? { cursor: input.cursor } : {}) },
      },
    }),
    verificationPricingSchema,
  );
}
export function readVerificationPhotos(client: ApiClient, branchId: unknown, query: unknown = {}) {
  const input = verificationPageQuerySchema.parse(query);
  return readApi(
    client.GET('/v1/admin/verifications/{branchId}/photos', {
      params: {
        path: { branchId: id.parse(branchId) },
        query: { limit: input.limit, ...(input.cursor ? { cursor: input.cursor } : {}) },
      },
    }),
    verificationPhotosSchema,
  );
}
