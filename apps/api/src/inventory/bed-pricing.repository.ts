import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { v7 } from 'uuid';
import { bedPrices, seats, rooms, roomTypes, type Database } from '@hsm/db';
import {
  bedRentPageSchema,
  bedRentVersionSchema,
  DomainError,
  money,
  moneyToJson,
  type BedRentInput,
  type bedRentQuerySchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import { effectivePrice } from './effective-price.js';
import { resolveBedDeposit } from './bed-deposit.js';
import { latestBedPrice } from './bed-price.js';
export class BedPricingRepository {
  constructor(
    readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(tx: Transaction, actor: Actor, branchId: string, bedId: string, write = false) {
    await lockActor(tx, actor, this.clock);
    const scope = await lockInventoryScope(
      tx,
      actor,
      branchId,
      write ? 'inventory_edit' : undefined,
    );
    if (write) await lockInventoryScope(tx, actor, branchId, 'pricing_edit');
    const [bed] = await tx
      .select({ bed: seats, room: rooms, type: roomTypes })
      .from(seats)
      .innerJoin(rooms, and(eq(rooms.id, seats.roomId), eq(rooms.branchId, seats.branchId)))
      .innerJoin(
        roomTypes,
        and(eq(roomTypes.id, rooms.roomTypeId), eq(roomTypes.branchId, rooms.branchId)),
      )
      .where(
        and(
          eq(seats.id, bedId),
          eq(seats.branchId, branchId),
          isNull(seats.archivedAt),
          isNull(rooms.archivedAt),
          isNull(roomTypes.archivedAt),
        ),
      )
      .for('update');
    if (!bed) throw new DomainError('NOT_FOUND', 404, 'Bed unavailable');
    if (write && bed.type.inventoryMode === 'whole_room')
      throw new DomainError('CONFLICT', 409, 'This legacy room does not offer individual beds');
    return { ...bed, scope };
  }
  async schedule(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    bedId: string,
    input: BedRentInput,
  ) {
    const target = await this.authorize(tx, actor, branchId, bedId, true);
    const [row] = await tx
      .insert(bedPrices)
      .values({
        id: v7(),
        branchId,
        roomId: target.room.id,
        bedId,
        effectiveFrom: input.effectiveFrom,
        monthlyRentPaisa: BigInt(input.monthlyRentPaisa),
        depositPaisa: input.depositPaisa === undefined ? null : BigInt(input.depositPaisa),
        createdByUserId: actor.userId,
        createdAt: this.clock(),
      })
      .returning();
    if (!row) throw new DomainError('INTERNAL', 500, 'Bed price unavailable');
    const result = projectBedPrice(row);
    await this.audit.hostel(tx, {
      actorUserId: actor.userId,
      actorRole: target.scope.actorRole,
      organizationId: target.scope.organizationId,
      branchId,
      action: 'inventory.bed_price.schedule',
      targetType: 'bed_price',
      targetId: row.id,
      after: result,
      createdAt: this.clock(),
    });
    await lockActor(tx, actor, this.clock);
    return result;
  }
  history(
    actor: Actor,
    branchId: string,
    bedId: string,
    query: z.infer<typeof bedRentQuerySchema>,
  ) {
    return this.database.transaction(async (tx) => {
      const target = await this.authorize(tx, actor, branchId, bedId);
      const access = await inventoryPermissions(
        tx,
        actor,
        branchId,
        target.scope.actorRole === 'owner',
      );
      const selected = await latestBedPrice(tx, branchId, bedId, this.clock());
      const legacy = await effectivePrice(tx, target.type, this.clock());
      const deposit = await resolveBedDeposit(
        tx,
        branchId,
        bedId,
        legacy.depositPaisa,
        this.clock(),
      );
      const amount = selected?.monthlyRentPaisa ?? legacy?.bedMonthlyRentPaisa;
      const rows = await tx
        .select()
        .from(bedPrices)
        .where(
          and(
            eq(bedPrices.branchId, branchId),
            eq(bedPrices.bedId, bedId),
            query.cursor ? lt(bedPrices.id, query.cursor) : undefined,
          ),
        )
        .orderBy(desc(bedPrices.id))
        .limit(query.limit + 1);
      await lockActor(tx, actor, this.clock);
      return bedRentPageSchema.parse({
        branchId,
        roomId: target.room.id,
        bedId,
        bedLabel: target.bed.label,
        canEdit:
          access.permissions.includes('inventory_edit') &&
          access.permissions.includes('pricing_edit') &&
          target.type.inventoryMode !== 'whole_room',
        current:
          amount === null || amount === undefined
            ? null
            : {
                monthlyRentPaisa: moneyToJson(money(amount)),
                depositPaisa: moneyToJson(money(deposit)),
                priceVersionId: selected?.id ?? null,
                effectiveFrom: selected?.effectiveFrom ?? null,
              },
        data: rows.slice(0, query.limit).map(projectBedPrice),
        nextCursor: rows.length > query.limit ? rows[query.limit - 1]?.id : null,
      });
    });
  }
}
function projectBedPrice(row: typeof bedPrices.$inferSelect) {
  return bedRentVersionSchema.parse({
    id: row.id,
    branchId: row.branchId,
    roomId: row.roomId,
    bedId: row.bedId,
    effectiveFrom: row.effectiveFrom,
    monthlyRentPaisa: moneyToJson(money(row.monthlyRentPaisa)),
    createdAt: row.createdAt.toISOString(),
    ...(row.depositPaisa === null || row.depositPaisa === undefined
      ? {}
      : { depositPaisa: moneyToJson(money(row.depositPaisa)) }),
  });
}
