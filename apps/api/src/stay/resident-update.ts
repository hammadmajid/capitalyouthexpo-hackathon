import { and, eq } from 'drizzle-orm';
import { residents, type Database } from '@hsm/db';
import { DomainError, type ResidentContactUpdate } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
// RES-006 / ACC-006: staff with stay_manage on this branch correct an offline resident's
// name and contact. The row is locked; before/after go to the hostel audit log in the same
// transaction. Linked residents own their details (CHG-009), archived ones are read-only.
export async function updateResidentContact(
  database: Database,
  actor: Actor,
  branchId: string,
  residentId: string,
  input: ResidentContactUpdate,
  clock: () => Date,
) {
  return database.transaction(async (tx) => {
    await lockActor(tx, actor, clock);
    const scope = await lockInventoryScope(tx, actor, branchId, 'stay_manage');
    const [resident] = await tx
      .select()
      .from(residents)
      .where(and(eq(residents.branchId, branchId), eq(residents.id, residentId)))
      .for('update');
    if (!resident) throw new DomainError('NOT_FOUND', 404, 'Resident unavailable');
    if (resident.userId !== null)
      throw new DomainError('CONFLICT', 409, 'This resident manages their own account details');
    if (resident.archivedAt !== null)
      throw new DomainError('CONFLICT', 409, 'Archived residents cannot be changed');
    const before = {
      displayName: resident.displayName,
      phone: resident.phone,
      email: resident.email,
    };
    const now = clock();
    await tx
      .update(residents)
      .set({ ...input, updatedAt: now })
      .where(and(eq(residents.branchId, branchId), eq(residents.id, residentId)));
    await new AuditWriter().hostel(tx, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'resident.contact.updated',
      targetType: 'resident',
      targetId: residentId,
      before,
      after: input,
      createdAt: now,
    });
    return { id: residentId, branchId, ...input };
  });
}
