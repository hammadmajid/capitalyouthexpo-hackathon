import { z } from 'zod';
import { managerInventoryGrantInputSchema, inventoryMutationSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import { IdempotencyService } from '../idempotency/service.js';
import { InventoryGrantRepository } from './grants.repository.js';
export class InventoryGrantService {
  constructor(
    private readonly repository: InventoryGrantRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  save(actor: Actor, key: string, branchId: string, assignmentId: string, body: unknown) {
    const id = z.string().uuid(),
      branch = id.parse(branchId).toLowerCase(),
      assignment = id.parse(assignmentId).toLowerCase();
    const input = managerInventoryGrantInputSchema.parse(body);
    return this.idempotency.execute(
      {
        actor,
        key,
        endpoint: 'PUT /branches/:branchId/managers/:assignmentId/inventory-permissions',
        status: 200,
      },
      { branch, assignment },
      input,
      inventoryMutationSchema,
      (database) => this.repository.authorize(database, actor, branch, assignment),
      () =>
        this.repository.save(requireTransaction(), actor, branch, assignment, input.permissions),
    );
  }
}
