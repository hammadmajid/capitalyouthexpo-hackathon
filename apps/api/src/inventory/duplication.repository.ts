import { and, eq, inArray, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import { rooms, roomTypes, seats } from '@hsm/db';
import { DomainError, roomDuplicationResultSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
export class RoomDuplicationRepository {
  constructor(
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(transaction: Transaction, actor: Actor, branchId: string, sourceRoomId: string) {
    await lockActor(transaction, actor, this.clock);
    const scope = await lockInventoryScope(transaction, actor, branchId, 'inventory_edit');
    const [source] = await transaction
      .select()
      .from(rooms)
      .where(
        and(eq(rooms.id, sourceRoomId), eq(rooms.branchId, branchId), isNull(rooms.archivedAt)),
      )
      .for('update');
    if (!source) throw new DomainError('NOT_FOUND', 404, 'Source room unavailable');
    const [type] = await transaction
      .select()
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, source.roomTypeId),
          eq(roomTypes.branchId, branchId),
          isNull(roomTypes.archivedAt),
        ),
      )
      .for('update');
    if (!type) throw new DomainError('NOT_FOUND', 404, 'Source room type unavailable');
    if (type.setupManaged)
      throw new DomainError('CONFLICT', 409, 'Add rooms and their beds individually');
    return { scope, source, type };
  }
  async duplicate(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    sourceRoomId: string,
    roomNumbers: string[],
  ) {
    const { scope, source, type } = await this.authorize(
      transaction,
      actor,
      branchId,
      sourceRoomId,
    );
    if (roomNumbers.length * type.capacity > 5000)
      throw new DomainError('VALIDATION_FAILED', 422, 'Duplicate at most 5000 beds per request');
    const [collision] = await transaction
      .select({ id: rooms.id })
      .from(rooms)
      .where(
        and(
          eq(rooms.branchId, branchId),
          inArray(rooms.label, roomNumbers),
          isNull(rooms.archivedAt),
        ),
      )
      .limit(1);
    if (collision) throw new DomainError('CONFLICT', 409, 'A room number is already in use');
    const copies = roomNumbers.map((label) => ({
      id: v7(),
      branchId,
      roomTypeId: source.roomTypeId,
      label,
      // CHG-048: a copy sits on the same floor as its source, so the Bed Board groups it there.
      floorId: source.floorId,
      status: 'inactive' as const,
    }));
    await transaction.insert(rooms).values(copies);
    // New physical identities never inherit occupancy, claims, files or retired ordinals.
    for (const room of copies)
      await transaction.insert(seats).values(
        Array.from({ length: type.capacity }, (_, index) => ({
          id: v7(),
          branchId,
          roomId: room.id,
          ordinal: index + 1,
          label: 'B' + (index + 1),
          status: 'inactive' as const,
        })),
      );
    const result = roomDuplicationResultSchema.parse({
      branchId,
      sourceRoomId,
      roomIds: copies.map((room) => room.id),
    });
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'inventory.room.duplicate',
      targetType: 'room',
      targetId: sourceRoomId,
      after: result,
      createdAt: this.clock(),
    });
    await lockActor(transaction, actor, this.clock);
    return result;
  }
}
