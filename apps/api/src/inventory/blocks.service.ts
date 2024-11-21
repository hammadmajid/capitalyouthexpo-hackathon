import { z } from 'zod';
import {
  inventoryBlockListQuerySchema,
  inventoryBlockInputSchema,
  inventoryBlockReleaseSchema,
  inventoryBlockStateSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { inventoryFailure } from '../booking/errors.js';
import { InventoryBlockRepository } from './blocks.repository.js';
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class InventoryBlockService {
  constructor(
    private readonly repository: InventoryBlockRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  list(actor: Actor, branchId: string, page: unknown) {
    return this.repository.read(
      actor,
      identifier.parse(branchId),
      inventoryBlockListQuerySchema.parse(page),
    );
  }
  create(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = identifier.parse(branchId),
      input = inventoryBlockInputSchema.parse(body);
    return this.idempotency
      .execute(
        { actor, key, endpoint: 'POST /inventory/blocks', status: 201 },
        { branch },
        input,
        inventoryBlockStateSchema,
        (database) => this.repository.authorize(database, actor, branch),
        () => this.repository.create(requireTransaction(), actor, branch, input),
      )
      .catch(inventoryFailure);
  }
  release(actor: Actor, key: string, branchId: string, blockId: string, body: unknown) {
    const branch = identifier.parse(branchId),
      block = identifier.parse(blockId),
      input = inventoryBlockReleaseSchema.parse(body);
    return this.idempotency
      .execute(
        { actor, key, endpoint: 'POST /inventory/blocks/:blockId/release', status: 200 },
        { branch, block },
        input,
        inventoryBlockStateSchema,
        (database) => this.repository.authorize(database, actor, branch),
        () => this.repository.release(requireTransaction(), actor, branch, block, input.reason),
      )
      .catch(inventoryFailure);
  }
}
