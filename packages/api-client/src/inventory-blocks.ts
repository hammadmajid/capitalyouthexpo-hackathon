import { z } from 'zod';
import {
  inventoryBlockInputSchema,
  inventoryBlockReleaseSchema,
  inventoryBlockStateSchema,
  inventoryBlockListQuerySchema,
  inventoryBlockPageSchema,
  type InventoryBlockInput,
  type InventoryBlockListQuery,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { readApi, ClientFailure } from './result.js';
import { setupPageQuery } from './owner-setup-body.js';
const id = (value: string) => z.string().uuid().parse(value).toLowerCase();
export function listInventoryBlocks(
  client: ApiClient,
  branchId: string,
  input: Partial<InventoryBlockListQuery> = {},
) {
  const branch = id(branchId),
    page = inventoryBlockListQuerySchema.parse(input);
  return readApi(
    client.GET('/v1/branches/{branchId}/inventory/blocks', {
      params: { path: { branchId: branch }, query: { ...setupPageQuery(page), state: page.state } },
    }),
    inventoryBlockPageSchema,
  ).then((result) => {
    if (result.data.some((block) => block.branchId !== branch))
      throw new ClientFailure('INVALID_RESPONSE');
    return result;
  });
}
function sameTarget(left: InventoryBlockInput['target'], right: InventoryBlockInput['target']) {
  return (
    left.kind === right.kind &&
    left.roomId === right.roomId &&
    (left.kind !== 'bed' || (right.kind === 'bed' && left.bedId === right.bedId))
  );
}
export function createInventoryBlock(
  client: ApiClient,
  branchId: string,
  input: InventoryBlockInput,
  key: string,
) {
  const branch = id(branchId),
    body = inventoryBlockInputSchema.parse(input);
  return readApi(
    client.POST('/v1/branches/{branchId}/inventory/blocks', {
      params: { path: { branchId: branch }, header: { 'Idempotency-Key': id(key) } },
      body,
    }),
    inventoryBlockStateSchema,
  ).then((result) => {
    if (
      result.branchId !== branch ||
      !sameTarget(result.target, body.target) ||
      result.kind !== body.kind ||
      result.range.moveInDate !== body.range.moveInDate ||
      result.range.moveOutDate !== body.range.moveOutDate ||
      result.releasedAt !== null
    )
      throw new ClientFailure('INVALID_RESPONSE');
    return result;
  });
}
export function releaseInventoryBlock(
  client: ApiClient,
  branchId: string,
  blockId: string,
  reason: string,
  key: string,
) {
  const branch = id(branchId),
    block = id(blockId);
  return readApi(
    client.POST('/v1/branches/{branchId}/inventory/blocks/{blockId}/release', {
      params: {
        path: { branchId: branch, blockId: block },
        header: { 'Idempotency-Key': id(key) },
      },
      body: inventoryBlockReleaseSchema.parse({ reason }),
    }),
    inventoryBlockStateSchema,
  ).then((result) => {
    if (result.branchId !== branch || result.id !== block || result.releasedAt === null)
      throw new ClientFailure('INVALID_RESPONSE');
    return result;
  });
}
