import { eq } from 'drizzle-orm';
import { branchSettings, type Database } from '@hsm/db';
import { upfrontSettingsSchema, type UpfrontSettings } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
async function read(database: Transaction, branchId: string, lock = false) {
  const query = database
    .select({
      requirement: branchSettings.upfrontRequirement,
      proofRetryAllowed: branchSettings.proofRetryAllowed,
    })
    .from(branchSettings)
    .where(eq(branchSettings.branchId, branchId));
  const [row] = await (lock ? query.for('update') : query);
  return upfrontSettingsSchema.parse(row ?? { requirement: 'none', proofRetryAllowed: true });
}
// BKG-007 / AUD-001: Owner-only upfront policy; existing requests keep their captured terms.
export class UpfrontSettingsRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  read(actor: Actor, branchId: string) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      await lockInventoryScope(transaction, actor, branchId, 'booking_manage');
      await lockActor(transaction, actor, this.clock);
      return read(transaction, branchId);
    });
  }
  async update(transaction: Transaction, actor: Actor, branchId: string, input: UpfrontSettings) {
    await lockActor(transaction, actor, this.clock);
    const scope = await lockInventoryScope(transaction, actor, branchId, undefined, true);
    await lockActor(transaction, actor, this.clock);
    const before = await read(transaction, branchId, true),
      now = this.clock();
    await transaction
      .insert(branchSettings)
      .values({
        branchId,
        upfrontRequirement: input.requirement,
        proofRetryAllowed: input.proofRetryAllowed,
        updatedAt: now,
        updatedByUserId: actor.userId,
      })
      .onConflictDoUpdate({
        target: branchSettings.branchId,
        set: {
          upfrontRequirement: input.requirement,
          proofRetryAllowed: input.proofRetryAllowed,
          updatedAt: now,
          updatedByUserId: actor.userId,
        },
      });
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      targetType: 'branch_settings',
      targetId: branchId,
      action: 'booking.upfront_settings.changed',
      before,
      after: input,
      createdAt: now,
    });
    return upfrontSettingsSchema.parse(input);
  }
}
