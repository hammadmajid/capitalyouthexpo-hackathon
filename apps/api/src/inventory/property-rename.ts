import { and, eq, isNull, sql } from 'drizzle-orm';
import { buildings, floors, rooms, seats } from '@hsm/db';
import { DomainError, propertyRenameResultSchema, type PropertyRenameKind } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockInventoryScope } from './scope.js';

export async function renameProperty(
  tx: Transaction,
  actor: Actor,
  branchId: string,
  kind: PropertyRenameKind,
  id: string,
  input: { name: string; expectedName: string },
  audit: AuditWriter,
  now: Date,
) {
  await lockActor(tx, actor, () => now);
  const scope = await lockInventoryScope(tx, actor, branchId, 'inventory_edit');
  const table = { building: buildings, floor: floors, room: rooms, seat: seats }[kind];
  const column =
    kind === 'building'
      ? buildings.name
      : kind === 'floor'
        ? floors.label
        : kind === 'room'
          ? rooms.label
          : seats.label;
  const where = and(eq(table.id, id), eq(table.branchId, branchId), isNull(table.archivedAt));
  const [target] = await tx.select({ name: column }).from(table).where(where).for('update');
  if (!target) throw new DomainError('NOT_FOUND', 404, 'Property unavailable');
  if (target.name !== input.expectedName)
    throw new DomainError('PRECONDITION_FAILED', 412, 'Name changed. Refresh and try again.');
  if ((kind === 'room' || kind === 'seat') && input.name.length > 80)
    throw new DomainError('VALIDATION_FAILED', 400, 'Use 80 characters or fewer.');
  if (kind === 'building')
    await tx
      .update(buildings)
      .set({ name: input.name, version: sql`${buildings.version} + 1`, updatedAt: now })
      .where(where);
  else if (kind === 'floor')
    await tx
      .update(floors)
      .set({ label: input.name, version: sql`${floors.version} + 1`, updatedAt: now })
      .where(where);
  else if (kind === 'room')
    await tx.update(rooms).set({ label: input.name, updatedAt: now }).where(where);
  else await tx.update(seats).set({ label: input.name, updatedAt: now }).where(where);
  const result = propertyRenameResultSchema.parse({ id, branchId, kind, name: input.name });
  await audit.hostel(tx, {
    actorUserId: actor.userId,
    actorRole: scope.actorRole,
    organizationId: scope.organizationId,
    branchId,
    action: 'inventory.' + kind + '.renamed',
    targetType: kind,
    targetId: id,
    before: { name: target.name },
    after: result,
    createdAt: now,
  });
  await lockActor(tx, actor, () => now);
  return result;
}
