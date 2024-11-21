import { claimCoversStart } from '../booking/claim-overlap.js';
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  rooms,
  seats,
  inventoryBlocks,
  inventoryClaims,
  expireRoomReservations,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  inventoryBlockStateSchema,
  type InventoryBlockInput,
  type InventoryBlockListQuery,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { readInventoryBlocks } from './blocks.read.js';
import { lockInventoryScope } from './scope.js';
export class InventoryBlockRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  read(actor: Actor, branchId: string, page: InventoryBlockListQuery) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      await lockInventoryScope(transaction, actor, branchId);
      await lockActor(transaction, actor, this.clock);
      return readInventoryBlocks(transaction, branchId, page);
    });
  }
  async authorize(database: Transaction, actor: Actor, branchId: string) {
    await lockInventoryScope(database, actor, branchId, 'block_manage');
    return true;
  }
  private async target(
    database: Transaction,
    branchId: string,
    input: InventoryBlockInput['target'],
    allowArchived = false,
  ) {
    const [room] = await database
      .select({ id: rooms.id })
      .from(rooms)
      .where(
        and(
          eq(rooms.id, input.roomId),
          eq(rooms.branchId, branchId),
          allowArchived ? undefined : isNull(rooms.archivedAt),
        ),
      )
      .for('update');
    if (!room) throw new DomainError('NOT_FOUND', 404, 'Room unavailable');
    if (input.kind === 'room') return null;
    const [bed] = await database
      .select({ id: seats.id, ordinal: seats.ordinal })
      .from(seats)
      .where(
        and(
          eq(seats.id, input.bedId),
          eq(seats.roomId, input.roomId),
          eq(seats.branchId, branchId),
          allowArchived ? undefined : isNull(seats.archivedAt),
        ),
      )
      .for('update');
    if (!bed) throw new DomainError('NOT_FOUND', 404, 'Bed unavailable');
    return bed;
  }
  async create(database: Transaction, actor: Actor, branchId: string, input: InventoryBlockInput) {
    const scope = await lockInventoryScope(database, actor, branchId, 'block_manage');
    const bed = await this.target(database, branchId, input.target),
      now = this.clock();
    await expireRoomReservations(database, input.target.roomId, now);
    const [conflict] = await database
      .select({ id: inventoryClaims.id })
      .from(inventoryClaims)
      .where(
        and(
          eq(inventoryClaims.branchId, branchId),
          eq(inventoryClaims.roomId, input.target.roomId),
          isNull(inventoryClaims.releasedAt),
          or(isNull(inventoryClaims.expiresAt), gt(inventoryClaims.expiresAt, now)),
          lt(inventoryClaims.moveInDate, input.range.moveOutDate),
          claimCoversStart(inventoryClaims, input.range.moveInDate, now),
          bed ? or(isNull(inventoryClaims.seatId), eq(inventoryClaims.seatId, bed.id)) : undefined,
        ),
      )
      .limit(1);
    if (conflict) throw new DomainError('CONFLICT', 409, 'Inventory is reserved for these dates');
    const id = v7();
    await database.insert(inventoryBlocks).values({
      id,
      branchId,
      roomId: input.target.roomId,
      seatId: bed?.id ?? null,
      ...input.range,
      reason: input.kind === 'manual' ? 1 : 2,
      createdByUserId: actor.userId,
      createdAt: now,
    });
    await database.insert(inventoryClaims).values({
      id: v7(),
      branchId,
      roomId: input.target.roomId,
      seatId: bed?.id ?? null,
      seatOrdinal: bed?.ordinal ?? null,
      blockId: id,
      ...input.range,
      expiresAt: null,
      createdAt: now,
    });
    const result = inventoryBlockStateSchema.parse({
      id,
      branchId,
      target: input.target,
      range: input.range,
      kind: input.kind,
      releasedAt: null,
    });
    await this.audit.hostel(database, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'inventory.block.created',
      targetType: 'inventory_block',
      targetId: id,
      after: { ...result, reason: input.reason },
      createdAt: now,
    });
    return result;
  }
  async release(
    database: Transaction,
    actor: Actor,
    branchId: string,
    blockId: string,
    reason: string,
  ) {
    const scope = await lockInventoryScope(database, actor, branchId, 'block_manage');
    const [pointer] = await database
      .select()
      .from(inventoryBlocks)
      .where(and(eq(inventoryBlocks.id, blockId), eq(inventoryBlocks.branchId, branchId)));
    if (!pointer) throw new DomainError('NOT_FOUND', 404, 'Block unavailable');
    const target = pointer.seatId
      ? { kind: 'bed' as const, roomId: pointer.roomId, bedId: pointer.seatId }
      : { kind: 'room' as const, roomId: pointer.roomId };
    await this.target(database, branchId, target, true);
    const [block] = await database
      .select()
      .from(inventoryBlocks)
      .where(and(eq(inventoryBlocks.id, blockId), eq(inventoryBlocks.branchId, branchId)))
      .for('update');
    if (!block) throw new DomainError('NOT_FOUND', 404, 'Block unavailable');
    const now = this.clock(),
      releasedAt = block.releasedAt ?? now;
    if (!block.releasedAt) {
      await database
        .update(inventoryBlocks)
        .set({ releasedAt })
        .where(eq(inventoryBlocks.id, blockId));
      await database
        .update(inventoryClaims)
        .set({ releasedAt })
        .where(and(eq(inventoryClaims.blockId, blockId), isNull(inventoryClaims.releasedAt)));
      await this.audit.hostel(database, {
        actorUserId: actor.userId,
        actorRole: scope.actorRole,
        organizationId: scope.organizationId,
        branchId,
        action: 'inventory.block.released',
        targetType: 'inventory_block',
        targetId: blockId,
        after: { releasedAt: releasedAt.toISOString(), reason },
        createdAt: now,
      });
    }
    return inventoryBlockStateSchema.parse({
      id: blockId,
      branchId,
      target,
      range: { moveInDate: block.moveInDate, moveOutDate: block.moveOutDate },
      kind: block.reason === 1 ? 'manual' : 'maintenance',
      releasedAt: releasedAt.toISOString(),
    });
  }
}
