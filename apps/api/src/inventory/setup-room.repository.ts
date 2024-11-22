import { and, eq, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import { floors, roomTypes, rooms } from '@hsm/db';
import { DomainError, inventoryMutationSchema, type SetupRoomInput } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockInventoryScope } from './scope.js';
import { lockBuilding, lockFloor, requireActiveProperty } from './property-structure-state.js';

export class SetupRoomRepository {
  constructor(
    private readonly audit: AuditWriter,
    private readonly clock: () => Date,
  ) {}
  async authorize(tx: Transaction, actor: Actor, branchId: string, floorId: string) {
    await lockActor(tx, actor, this.clock);
    const scope = await lockInventoryScope(tx, actor, branchId, 'inventory_edit');
    const [parent] = await tx
      .select({ buildingId: floors.buildingId })
      .from(floors)
      .where(and(eq(floors.branchId, branchId), eq(floors.id, floorId), isNull(floors.archivedAt)));
    if (!parent) throw new DomainError('NOT_FOUND', 404, 'Floor unavailable');
    requireActiveProperty((await lockBuilding(tx, branchId, parent.buildingId)).archivedAt);
    requireActiveProperty((await lockFloor(tx, branchId, floorId)).archivedAt);
    return scope;
  }
  async create(tx: Transaction, actor: Actor, branchId: string, input: SetupRoomInput) {
    const scope = await this.authorize(tx, actor, branchId, input.floorId);
    const roomTypeId = v7(),
      id = v7(),
      now = this.clock();
    // Empty setup is unpriced, not a free bed. Each physical bed gets its own price later.
    await tx.insert(roomTypes).values({
      id: roomTypeId,
      branchId,
      name: 'Room',
      inventoryMode: 'per_bed',
      capacity: 0,
      setupManaged: true,
      bedMonthlyRentPaisa: null,
      roomMonthlyRentPaisa: null,
      depositPaisa: 0n,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(rooms).values({
      id,
      branchId,
      roomTypeId,
      floorId: input.floorId,
      label: input.label,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await this.audit.hostel(tx, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'inventory.room.created',
      targetType: 'room',
      targetId: id,
      after: { roomTypeId, floorId: input.floorId, label: input.label, setupManaged: true },
      createdAt: now,
    });
    await lockActor(tx, actor, this.clock);
    return inventoryMutationSchema.parse({ id, branchId, kind: 'room' });
  }
}
