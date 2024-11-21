import { eq } from 'drizzle-orm';
import { managerInventoryGrants, type Database } from '@hsm/db';
import { managerInventoryGrantStateSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { InventoryGrantRepository } from './grants.repository.js';
export class InventoryGrantReadRepository {
  constructor(
    private readonly database: Database,
    private readonly grants = new InventoryGrantRepository(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  read(actor: Actor, branchId: string, assignmentId: string) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      // Keep the existing assignment-before-branch lock order used by grant replacement.
      await this.grants.authorize(transaction, actor, branchId, assignmentId);
      await lockActor(transaction, actor, this.clock);
      const rows = await transaction
        .select({ permission: managerInventoryGrants.permission })
        .from(managerInventoryGrants)
        .where(eq(managerInventoryGrants.assignmentId, assignmentId))
        .orderBy(managerInventoryGrants.permission)
        .limit(9);
      await lockActor(transaction, actor, this.clock);
      return managerInventoryGrantStateSchema.parse({
        branchId,
        assignmentId,
        permissions: rows.map((row) => row.permission),
      });
    });
  }
}
