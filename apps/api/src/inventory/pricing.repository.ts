import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { v7 } from 'uuid';
import { roomTypes, roomTypePrices, type Database } from '@hsm/db';
import {
  DomainError,
  money,
  moneyToJson,
  roomPriceVersionSchema,
  roomPriceHistorySchema,
  type RoomPriceInput,
  type roomPriceQuerySchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import type { Actor } from '../authorization/store.js';
import { lockInventoryScope } from './scope.js';

export class InventoryPricingRepository {
  constructor(
    readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(tx: Transaction, actor: Actor, branch: string, typeId: string, write = false) {
    await lockActor(tx, actor, this.clock);
    const scope = await lockInventoryScope(tx, actor, branch, write ? 'inventory_edit' : undefined);
    if (write) await lockInventoryScope(tx, actor, branch, 'pricing_edit');
    const [type] = await tx
      .select()
      .from(roomTypes)
      .where(
        and(eq(roomTypes.id, typeId), eq(roomTypes.branchId, branch), isNull(roomTypes.archivedAt)),
      )
      .for('update');
    if (!type) throw new DomainError('NOT_FOUND', 404, 'Room type unavailable');
    if (type.setupManaged)
      throw new DomainError(
        'CONFLICT',
        409,
        'Set rent on each bed; security is agreed at admission',
      );
    return { scope, type };
  }
  async schedule(
    tx: Transaction,
    actor: Actor,
    branch: string,
    typeId: string,
    input: RoomPriceInput,
  ) {
    const { scope, type } = await this.authorize(tx, actor, branch, typeId, true);
    if (
      (type.inventoryMode !== 'whole_room' && input.bedMonthlyRentPaisa === null) ||
      (type.inventoryMode !== 'per_bed' && input.roomMonthlyRentPaisa === null)
    )
      throw new DomainError('VALIDATION_FAILED', 422, 'Price must support the room inventory mode');
    const [version] = await tx
      .insert(roomTypePrices)
      .values({
        id: v7(),
        branchId: branch,
        roomTypeId: typeId,
        ...input,
        bedMonthlyRentPaisa:
          input.bedMonthlyRentPaisa === null ? null : BigInt(input.bedMonthlyRentPaisa),
        roomMonthlyRentPaisa:
          input.roomMonthlyRentPaisa === null ? null : BigInt(input.roomMonthlyRentPaisa),
        depositPaisa: BigInt(input.depositPaisa),
        createdByUserId: actor.userId,
        createdAt: this.clock(),
      })
      .returning();
    if (!version) throw new DomainError('INTERNAL', 500, 'Price version unavailable');
    const result = projectPrice(version);
    await this.audit.hostel(tx, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId: branch,
      action: 'inventory.price.schedule',
      targetType: 'room_type_price',
      targetId: version.id,
      after: result,
    });
    await lockActor(tx, actor, this.clock);
    return result;
  }
  history(
    actor: Actor,
    branch: string,
    typeId: string,
    query: z.infer<typeof roomPriceQuerySchema>,
  ) {
    return this.database.transaction(async (tx) => {
      await this.authorize(tx, actor, branch, typeId);
      const rows = await tx
        .select()
        .from(roomTypePrices)
        .where(
          and(
            eq(roomTypePrices.branchId, branch),
            eq(roomTypePrices.roomTypeId, typeId),
            query.cursor ? lt(roomTypePrices.effectiveFrom, query.cursor) : undefined,
          ),
        )
        .orderBy(desc(roomTypePrices.effectiveFrom))
        .limit(query.limit + 1);
      const data = rows.slice(0, query.limit).map(projectPrice);
      await lockActor(tx, actor, this.clock);
      return roomPriceHistorySchema.parse({
        branchId: branch,
        roomTypeId: typeId,
        data,
        nextCursor: rows.length > query.limit ? data.at(-1)?.effectiveFrom : null,
      });
    });
  }
}
function projectPrice(row: typeof roomTypePrices.$inferSelect) {
  return roomPriceVersionSchema.parse({
    id: row.id,
    branchId: row.branchId,
    roomTypeId: row.roomTypeId,
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt.toISOString(),
    bedMonthlyRentPaisa:
      row.bedMonthlyRentPaisa === null ? null : moneyToJson(money(row.bedMonthlyRentPaisa)),
    roomMonthlyRentPaisa:
      row.roomMonthlyRentPaisa === null ? null : moneyToJson(money(row.roomMonthlyRentPaisa)),
    depositPaisa: moneyToJson(money(row.depositPaisa)),
    fees: row.fees,
  });
}
