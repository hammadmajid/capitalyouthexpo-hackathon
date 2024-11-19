import {
  propertyRenameInputSchema,
  propertyRenameKindSchema,
  propertyRenameResultSchema,
  stayIdentifierSchema as id,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export async function renameProperty(
  client: ApiClient,
  branch: string,
  kind: unknown,
  target: string,
  input: unknown,
  key: string,
) {
  const branchId = id.parse(branch),
    targetId = id.parse(target),
    resource = propertyRenameKindSchema.parse(kind),
    body = propertyRenameInputSchema.parse(input);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/inventory/metadata/{kind}/{targetId}/rename', {
      params: {
        path: { branchId, kind: resource, targetId },
        header: { 'Idempotency-Key': id.parse(key) },
      },
      body,
    }),
    propertyRenameResultSchema,
  );
  if (
    result.id !== targetId ||
    result.branchId !== branchId ||
    result.kind !== resource ||
    result.name !== body.name
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
