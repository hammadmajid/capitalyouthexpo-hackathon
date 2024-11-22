import { and, eq } from 'drizzle-orm';
import { roomAmenities, rooms, type Database } from '@hsm/db';
import { DomainError, type RoomLevelAmenitiesInput } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import { readRoomAmenities, requireRoomAmenityCodes } from './room-amenities-state.js';
import {
  lockAmenityRoomRecord,
  projectRoomLevelAmenities,
  readOwnRoomAmenities,
} from './room-level-amenities-state.js';
// ROOM-AMN (SRS v2.15): per-room amenities; same authority (listing_edit), versioning and
// audit as room-type amenities. Inheriting rooms keep no own rows.
export class RoomLevelAmenitiesRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    roomId: string,
    edit = true,
  ) {
    await lockActor(transaction, actor, this.clock);
    const scope = await lockInventoryScope(
      transaction,
      actor,
      branchId,
      edit ? 'listing_edit' : undefined,
    );
    const room = await lockAmenityRoomRecord(transaction, branchId, roomId);
    await lockActor(transaction, actor, this.clock);
    return { scope, room };
  }
  private async state(
    transaction: Transaction,
    branchId: string,
    roomId: string,
    room: { roomTypeId: string; customized: boolean },
    canEdit: boolean,
  ) {
    return projectRoomLevelAmenities({
      branchId,
      roomId,
      roomTypeId: room.roomTypeId,
      customized: room.customized,
      own: await readOwnRoomAmenities(transaction, branchId, roomId),
      type: await readRoomAmenities(transaction, branchId, room.roomTypeId),
      canEdit,
    });
  }
  read(actor: Actor, branchId: string, roomId: string) {
    return this.database.transaction(async (transaction) => {
      const { scope, room } = await this.authorize(transaction, actor, branchId, roomId, false);
      const access = await inventoryPermissions(
        transaction,
        actor,
        branchId,
        scope.actorRole === 'owner',
      );
      const result = await this.state(
        transaction,
        branchId,
        roomId,
        room,
        access.permissions.includes('listing_edit'),
      );
      await lockActor(transaction, actor, this.clock);
      return result;
    });
  }
  async save(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    roomId: string,
    expectedVersion: string,
    input: RoomLevelAmenitiesInput,
  ) {
    const { scope, room } = await this.authorize(transaction, actor, branchId, roomId);
    const before = await this.state(transaction, branchId, roomId, room, true);
    if (before.version !== expectedVersion)
      throw new DomainError(
        'PRECONDITION_FAILED',
        412,
        'Room amenities changed; refresh current settings',
      );
    const custom = input.mode === 'custom';
    if (custom)
      await requireRoomAmenityCodes(
        transaction,
        { amenityCodes: input.amenityCodes },
        before.amenities,
        branchId,
      );
    await lockActor(transaction, actor, this.clock);
    await transaction
      .delete(roomAmenities)
      .where(and(eq(roomAmenities.branchId, branchId), eq(roomAmenities.roomId, roomId)));
    if (custom && input.amenityCodes.length)
      await transaction
        .insert(roomAmenities)
        .values(
          [...input.amenityCodes].sort().map((amenityCode) => ({ branchId, roomId, amenityCode })),
        );
    await transaction
      .update(rooms)
      .set({ amenitiesCustomized: custom, updatedAt: this.clock() })
      .where(and(eq(rooms.branchId, branchId), eq(rooms.id, roomId)));
    const after = await this.state(
      transaction,
      branchId,
      roomId,
      { roomTypeId: room.roomTypeId, customized: custom },
      true,
    );
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'room.amenities.changed',
      targetType: 'room',
      targetId: roomId,
      before,
      after,
      createdAt: this.clock(),
    });
    await lockActor(transaction, actor, this.clock);
    return after;
  }
}
