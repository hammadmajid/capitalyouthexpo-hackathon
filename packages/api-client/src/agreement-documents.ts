import {
  agreementFileInputSchema,
  agreementFileSchema,
  agreementFileQuerySchema,
  agreementFilePageSchema,
  agreementTemplateInputSchema,
  billingPolicyVersionSchema,
  downloadResponseSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export type AgreementDocumentTarget = { stayId: string; agreementId: string; branchId?: string };
function scope(input: AgreementDocumentTarget) {
  return {
    stayId: stayIdentifierSchema.parse(input.stayId),
    agreementId: stayIdentifierSchema.parse(input.agreementId),
    ...(input.branchId ? { branchId: stayIdentifierSchema.parse(input.branchId) } : {}),
  };
}
function exact(
  result: { stayId: string; agreementId: string; branchId: string },
  target: AgreementDocumentTarget,
) {
  if (
    result.stayId !== target.stayId ||
    result.agreementId !== target.agreementId ||
    (target.branchId && result.branchId !== target.branchId)
  )
    throw new ClientFailure('INVALID_RESPONSE');
}
export async function readAgreementFiles(
  client: ApiClient,
  input: AgreementDocumentTarget,
  query: unknown = {},
) {
  const target = scope(input),
    page = agreementFileQuerySchema.parse(query),
    wireQuery = { limit: page.limit, ...(page.cursor ? { cursor: page.cursor } : {}) };
  const operation = target.branchId
    ? client.GET('/v1/branches/{branchId}/stays/{stayId}/agreements/{agreementId}/files', {
        params: { path: { ...target, branchId: target.branchId }, query: wireQuery },
      })
    : client.GET('/v1/me/stays/{stayId}/agreements/{agreementId}/files', {
        params: { path: target, query: wireQuery },
      });
  const result = await readApi(operation, agreementFilePageSchema);
  exact(result, target);
  const ids = new Set<string>();
  for (const row of result.data) {
    exact(row, { ...target, branchId: result.branchId });
    if (ids.has(row.id) || (page.cursor && row.id <= page.cursor))
      throw new ClientFailure('INVALID_RESPONSE');
    ids.add(row.id);
  }
  if (
    result.data.length > page.limit ||
    result.data.some((row, i) => i > 0 && row.id <= (result.data[i - 1]?.id ?? '')) ||
    (result.nextCursor !== null &&
      (result.data.length !== page.limit || result.nextCursor !== result.data.at(-1)?.id))
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function attachAgreementFile(
  client: ApiClient,
  input: AgreementDocumentTarget,
  value: unknown,
  key: string,
) {
  const target = scope(input),
    body = agreementFileInputSchema.parse(value),
    header = { 'Idempotency-Key': stayIdentifierSchema.parse(key) };
  const operation = target.branchId
    ? client.POST('/v1/branches/{branchId}/stays/{stayId}/agreements/{agreementId}/files', {
        params: { path: { ...target, branchId: target.branchId }, header },
        body,
      })
    : client.POST('/v1/me/stays/{stayId}/agreements/{agreementId}/files', {
        params: { path: target, header },
        body,
      });
  const result = await readApi(operation, agreementFileSchema);
  exact(result, target);
  if (result.fileId !== body.fileId || result.label !== body.label)
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export function readAgreementFileUrl(
  client: ApiClient,
  input: AgreementDocumentTarget,
  file: string,
) {
  const target = scope(input),
    path = { ...target, fileId: stayIdentifierSchema.parse(file) };
  return readApi(
    target.branchId
      ? client.GET(
          '/v1/branches/{branchId}/stays/{stayId}/agreements/{agreementId}/files/{fileId}/download',
          { params: { path: { ...path, branchId: target.branchId } } },
        )
      : client.GET('/v1/me/stays/{stayId}/agreements/{agreementId}/files/{fileId}/download', {
          params: { path },
        }),
    downloadResponseSchema,
  );
}
export async function saveAgreementTemplate(
  client: ApiClient,
  branch: string,
  input: unknown,
  key: string,
) {
  const branchId = stayIdentifierSchema.parse(branch),
    body = agreementTemplateInputSchema.parse(input);
  const result = await readApi(
    client.PUT('/v1/branches/{branchId}/agreement-template', {
      params: {
        path: { branchId },
        header: { 'Idempotency-Key': stayIdentifierSchema.parse(key) },
      },
      body,
    }),
    billingPolicyVersionSchema,
  );
  if (
    result.level !== 'branch' ||
    result.scopeId !== branchId ||
    JSON.stringify(result.policy.agreementTemplate ?? null) !== JSON.stringify(body.template)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
