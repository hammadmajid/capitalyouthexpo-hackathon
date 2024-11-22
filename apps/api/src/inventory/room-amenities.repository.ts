import { and, eq } from 'drizzle-orm';
import { roomTypeAmenities, type Database } from '@hsm/db';
import { DomainError, type RoomAmenitiesInput } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import {
  lockAmenityRoom,
  projectRoomAmenities,
  readRoomAmenities,
  requireRoomAmenityCodes,
} from './room-amenities-state.js';
export class RoomAmenitiesRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    roomTypeId: string,
    edit = true,
  ) {
    await lockActor(transaction, actor, this.clock);
    const scope = await lockInventoryScope(
      transaction,
      actor,
      branchId,
      edit ? 'listing_edit' : undefined,
    );
    await lockAmenityRoom(transaction, branchId, roomTypeId);
    await lockActor(transaction, actor, this.clock);
    return scope;
  }
  read(actor: Actor, branchId: string, roomTypeId: string) {
    return this.database.transaction(async (transaction) => {
      const scope = await this.authorize(transaction, actor, branchId, roomTypeId, false);
      const access = await inventoryPermissions(
        transaction,
        actor,
        branchId,
        scope.actorRole === 'owner',
      );
      const selected = await readRoomAmenities(transaction, branchId, roomTypeId);
      await lockActor(transaction, actor, this.clock);
      return projectRoomAmenities(
        branchId,
        roomTypeId,
        selected,
        access.permissions.includes('listing_edit'),
      );
    });
  }
  async save(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    roomTypeId: string,
    expectedVersion: string,
    input: RoomAmenitiesInput,
  ) {
    const scope = await this.authorize(transaction, actor, branchId, roomTypeId);
    const selected = await readRoomAmenities(transaction, branchId, roomTypeId),
      before = projectRoomAmenities(branchId, roomTypeId, selected, true);
    if (before.version !== expectedVersion)
      throw new DomainError(
        'PRECONDITION_FAILED',
        412,
        'Room amenities changed; refresh current settings',
      );
    await requireRoomAmenityCodes(transaction, input, selected, branchId);
    await lockActor(transaction, actor, this.clock);
    await transaction
      .delete(roomTypeAmenities)
      .where(
        and(eq(roomTypeAmenities.branchId, branchId), eq(roomTypeAmenities.roomTypeId, roomTypeId)),
      );
    if (input.amenityCodes.length)
      await transaction
        .insert(roomTypeAmenities)
        .values(
          [...input.amenityCodes]
            .sort()
            .map((amenityCode) => ({ branchId, roomTypeId, amenityCode })),
        );
    const after = projectRoomAmenities(
      branchId,
      roomTypeId,
      await readRoomAmenities(transaction, branchId, roomTypeId),
      true,
    );
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'room_type.amenities.changed',
      targetType: 'room_type',
      targetId: roomTypeId,
      before,
      after,
      createdAt: this.clock(),
    });
    await lockActor(transaction, actor, this.clock);
    return after;
  }
}
