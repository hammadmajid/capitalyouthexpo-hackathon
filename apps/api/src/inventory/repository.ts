import { SetupRoomRepository } from './setup-room.repository.js';
import { renameProperty } from './property-rename.js';
import type { PropertyRenameKind } from '@hsm/contracts';
import {
  inventoryAccessSchema,
  inventoryPageQuerySchema,
  inventoryPageKindSchema,
  type InventoryPageKind,
  type InventoryPageQuery,
} from '@hsm/contracts';
import { readInventoryTypePage, readInventoryRoomPage, readInventorySeatPage } from './pages.js';
import { InventoryLifecycleRepository } from './lifecycle.repository.js';
import type { LifecycleTarget } from './lifecycle-target.js';
import { inventoryPermissions } from './permissions.js';
import { and, eq, isNull, max } from 'drizzle-orm';
import { v7 } from 'uuid';
import { roomTypes, roomTypeFees, rooms, seats, type Database } from '@hsm/db';
import {
  DomainError,
  inventoryMutationSchema,
  type RoomTypeInput,
  type RoomInput,
  type SeatInput,
  type InventoryPermission,
} from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import type { Actor } from '../authorization/store.js';
import { lockInventoryScope } from './scope.js';
import { readBranchInventory } from './read.js';
import { RoomDuplicationRepository } from './duplication.repository.js';
import { InventoryPricingRepository } from './pricing.repository.js';
import { effectivePrice } from './effective-price.js';
import { BedPricingRepository } from './bed-pricing.repository.js';
import { pakistanToday } from '../booking/policy.js';
export class InventoryRepository {
  setupRooms() {
    return new SetupRoomRepository(this.audit, this.clock);
  }
  rename(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    kind: PropertyRenameKind,
    id: string,
    input: { name: string; expectedName: string },
  ) {
    return renameProperty(transaction, actor, branchId, kind, id, input, this.audit, this.clock());
  }
  bedPricing() {
    return new BedPricingRepository(this.database, this.audit, this.clock);
  }
  pricing() {
    return new InventoryPricingRepository(this.database, this.audit, this.clock);
  }
  duplication() {
    return new RoomDuplicationRepository(this.audit, this.clock);
  }
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  authorize(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    permission?: InventoryPermission,
  ) {
    return lockInventoryScope(transaction, actor, branchId, permission);
  }
  read(actor: Actor, branchId: string) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      const scope = await this.authorize(transaction, actor, branchId);
      return readBranchInventory(
        transaction,
        branchId,
        await inventoryPermissions(transaction, actor, branchId, scope.actorRole === 'owner'),
        this.clock(),
      );
    });
  }
  access(actor: Actor, branchId: string) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      const scope = await this.authorize(transaction, actor, branchId);
      const result = inventoryAccessSchema.parse({
        branchId,
        ...(await inventoryPermissions(transaction, actor, branchId, scope.actorRole === 'owner')),
      });
      await lockActor(transaction, actor, this.clock);
      return result;
    });
  }
  page(
    actor: Actor,
    branchId: string,
    kind: InventoryPageKind,
    query: InventoryPageQuery,
    parentId?: string,
  ) {
    return this.database.transaction(async (transaction) => {
      const page = inventoryPageQuerySchema.parse(query),
        collection = inventoryPageKindSchema.parse(kind);
      await lockActor(transaction, actor, this.clock);
      const scope = await this.authorize(transaction, actor, branchId);
      const access = inventoryAccessSchema.parse({
        branchId,
        ...(await inventoryPermissions(transaction, actor, branchId, scope.actorRole === 'owner')),
      });
      if ((collection === 'room_types') !== (parentId === undefined))
        throw new DomainError(
          'VALIDATION_FAILED',
          400,
          'Inventory parent is required only for child pages',
        );
      let result;
      if (collection === 'room_types')
        result = await readInventoryTypePage(transaction, access, page);
      else {
        if (parentId === undefined)
          throw new DomainError('VALIDATION_FAILED', 400, 'Inventory parent is required');
        result =
          collection === 'rooms'
            ? await readInventoryRoomPage(transaction, access, parentId, page)
            : await readInventorySeatPage(transaction, access, parentId, page, this.clock());
      }
      await lockActor(transaction, actor, this.clock);
      return result;
    });
  }
  async roomType(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    input: RoomTypeInput,
    id?: string,
  ) {
    const scope = await this.authorize(transaction, actor, branchId, 'pricing_edit');
    const typeId = id ?? v7(),
      { fees, ...terms } = input;
    const values = {
      ...terms,
      bedMonthlyRentPaisa:
        terms.bedMonthlyRentPaisa === null ? null : BigInt(terms.bedMonthlyRentPaisa),
      roomMonthlyRentPaisa:
        terms.roomMonthlyRentPaisa === null ? null : BigInt(terms.roomMonthlyRentPaisa),
      depositPaisa: BigInt(terms.depositPaisa),
      updatedAt: this.clock(),
    };
    if (id) {
      const [type] = await transaction
        .select()
        .from(roomTypes)
        .where(
          and(eq(roomTypes.id, id), eq(roomTypes.branchId, branchId), isNull(roomTypes.archivedAt)),
        )
        .for('update');
      if (!type) throw new DomainError('NOT_FOUND', 404, 'Room type unavailable');
      if (type.setupManaged)
        throw new DomainError('CONFLICT', 409, 'Manage room names and bed rents separately');
      const current = await effectivePrice(transaction, type, this.clock());
      const normalizedFees = (items: typeof fees) =>
        JSON.stringify(
          [...items].sort((a, b) => (a.code + a.cadence).localeCompare(b.code + b.cadence)),
        );
      if (
        current.bedMonthlyRentPaisa !== values.bedMonthlyRentPaisa ||
        current.roomMonthlyRentPaisa !== values.roomMonthlyRentPaisa ||
        current.depositPaisa !== values.depositPaisa ||
        normalizedFees(current.fees) !== normalizedFees(fees)
      )
        throw new DomainError(
          'VALIDATION_FAILED',
          422,
          'Publish price changes with an explicit effective date',
        );
      await transaction
        .update(roomTypes)
        .set({
          name: terms.name,
          inventoryMode: terms.inventoryMode,
          capacity: terms.capacity,
          updatedAt: values.updatedAt,
        })
        .where(eq(roomTypes.id, id));
    } else await transaction.insert(roomTypes).values({ id: typeId, branchId, ...values });
    if (!id && fees.length)
      await transaction.insert(roomTypeFees).values(
        fees.map((fee) => ({
          branchId,
          roomTypeId: typeId,
          ...fee,
          amountPaisa: BigInt(fee.amountPaisa),
        })),
      );
    return this.record(transaction, actor, scope, branchId, typeId, 'room_type');
  }
  async room(transaction: Transaction, actor: Actor, branchId: string, input: RoomInput) {
    const scope = await this.authorize(transaction, actor, branchId, 'inventory_edit');
    const [type] = await transaction
      .select({ id: roomTypes.id, setupManaged: roomTypes.setupManaged })
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, input.roomTypeId),
          eq(roomTypes.branchId, branchId),
          isNull(roomTypes.archivedAt),
        ),
      )
      .for('update');
    if (!type) throw new DomainError('NOT_FOUND', 404, 'Room type unavailable');
    if (type.setupManaged)
      throw new DomainError('CONFLICT', 409, 'Create an empty setup room instead');
    const id = v7();
    await transaction.insert(rooms).values({ id, branchId, ...input });
    return this.record(transaction, actor, scope, branchId, id, 'room');
  }
  async seat(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    roomId: string,
    input: SeatInput,
  ) {
    const scope = await this.authorize(transaction, actor, branchId, 'inventory_edit');
    if (input.monthlyRentPaisa !== undefined)
      await this.authorize(transaction, actor, branchId, 'pricing_edit');
    const [room] = await transaction
      .select({ id: rooms.id, setupManaged: roomTypes.setupManaged })
      .from(rooms)
      .innerJoin(
        roomTypes,
        and(eq(roomTypes.id, rooms.roomTypeId), eq(roomTypes.branchId, rooms.branchId)),
      )
      .where(and(eq(rooms.id, roomId), eq(rooms.branchId, branchId), isNull(rooms.archivedAt)))
      .for('update');
    if (!room) throw new DomainError('NOT_FOUND', 404, 'Room unavailable');
    if (room.setupManaged && input.monthlyRentPaisa === undefined)
      throw new DomainError('VALIDATION_FAILED', 422, 'Set this bed’s monthly rent');
    const [last] = await transaction
      .select({ ordinal: max(seats.ordinal) })
      .from(seats)
      .where(eq(seats.roomId, roomId));
    const id = v7();
    const { monthlyRentPaisa, depositPaisa, ...bedInput } = input;
    await transaction
      .insert(seats)
      .values({ id, branchId, roomId, ...bedInput, ordinal: (last?.ordinal ?? 0) + 1 });
    if (monthlyRentPaisa !== undefined)
      await this.bedPricing().schedule(transaction, actor, branchId, id, {
        effectiveFrom: pakistanToday(this.clock()),
        monthlyRentPaisa,
        ...(depositPaisa === undefined ? {} : { depositPaisa }),
      });
    return this.record(transaction, actor, scope, branchId, id, 'seat');
  }
  state(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    target: LifecycleTarget & { kind: 'room' | 'seat' },
    status: 'active' | 'inactive' | 'maintenance',
    reason: string,
  ) {
    return new InventoryLifecycleRepository(this.audit, this.clock).state(
      transaction,
      actor,
      branchId,
      target,
      status,
      reason,
    );
  }
  archive(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    target: LifecycleTarget,
    reason: string,
  ) {
    return new InventoryLifecycleRepository(this.audit, this.clock).archive(
      transaction,
      actor,
      branchId,
      target,
      reason,
    );
  }
  private async record(
    transaction: Transaction,
    actor: Actor,
    scope: Awaited<ReturnType<typeof lockInventoryScope>>,
    branchId: string,
    id: string,
    kind: 'room_type' | 'room' | 'seat',
  ) {
    const result = inventoryMutationSchema.parse({ id, branchId, kind });
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'inventory.' + kind + '.save',
      targetType: kind,
      targetId: id,
      after: result,
      createdAt: this.clock(),
    });
    return result;
  }
}
