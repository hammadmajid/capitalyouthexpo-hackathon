import { setupRoomInputSchema } from '@hsm/contracts';
import {
  propertyRenameInputSchema,
  propertyRenameKindSchema,
  propertyRenameResultSchema,
} from '@hsm/contracts';
import { inventoryFailure } from '../booking/errors.js';
import { bedRentInputSchema, bedRentQuerySchema, bedRentVersionSchema } from '@hsm/contracts';
import { z } from 'zod';
import {
  inventoryPageQuerySchema,
  inventoryPageKindSchema,
  type InventoryPageKind,
  inventoryMutationSchema,
  inventoryStateInputSchema,
  inventoryArchiveInputSchema,
  roomTypeInputSchema,
  roomInputSchema,
  seatInputSchema,
  roomDuplicationInputSchema,
  roomDuplicationResultSchema,
  duplicationRoomNumbers,
  roomPriceInputSchema,
  roomPriceVersionSchema,
  roomPriceQuerySchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import { IdempotencyService } from '../idempotency/service.js';
import { InventoryRepository } from './repository.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class InventoryService {
  createSetupRoom(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = id.parse(branchId),
      input = setupRoomInputSchema.parse(body),
      repository = this.repository.setupRooms();
    return this.idempotency
      .execute(
        { actor, key, endpoint: 'POST /inventory/setup-rooms', status: 201 },
        { branch },
        input,
        inventoryMutationSchema,
        async (tx) => {
          await repository.authorize(tx, actor, branch, input.floorId);
          return true;
        },
        () => repository.create(requireTransaction(), actor, branch, input),
      )
      .catch(inventoryFailure);
  }
  rename(
    actor: Actor,
    key: string,
    branchId: string,
    kind: unknown,
    targetId: string,
    body: unknown,
  ) {
    const branch = id.parse(branchId),
      target = id.parse(targetId),
      resource = propertyRenameKindSchema.parse(kind),
      input = propertyRenameInputSchema.parse(body);
    return this.idempotency
      .execute(
        { actor, key, endpoint: 'POST /inventory/metadata/:kind/:targetId/rename', status: 200 },
        { branch, resource, target },
        input,
        propertyRenameResultSchema,
        async (tx) => {
          await this.repository.authorize(tx, actor, branch, 'inventory_edit');
          return true;
        },
        () => this.repository.rename(requireTransaction(), actor, branch, resource, target, input),
      )
      .catch(inventoryFailure);
  }

  bedPriceHistory(actor: Actor, branchId: string, bedId: string, query: unknown) {
    return this.repository
      .bedPricing()
      .history(actor, id.parse(branchId), id.parse(bedId), bedRentQuerySchema.parse(query));
  }
  scheduleBedPrice(actor: Actor, key: string, branchId: string, bedId: string, body: unknown) {
    const branch = id.parse(branchId),
      bed = id.parse(bedId),
      input = bedRentInputSchema.parse(body),
      repository = this.repository.bedPricing();
    return this.idempotency
      .execute(
        {
          actor,
          key,
          endpoint: 'POST /branches/:branchId/inventory/beds/:bedId/prices',
          status: 201,
        },
        { branch, bed },
        input,
        bedRentVersionSchema,
        async (tx) => {
          await repository.authorize(tx, actor, branch, bed, true);
          return true;
        },
        () => repository.schedule(requireTransaction(), actor, branch, bed, input),
      )
      .catch(inventoryFailure);
  }
  priceHistory(actor: Actor, branchId: string, typeId: string, query: unknown) {
    return this.repository
      .pricing()
      .history(actor, id.parse(branchId), id.parse(typeId), roomPriceQuerySchema.parse(query));
  }
  schedulePrice(actor: Actor, key: string, branchId: string, typeId: string, body: unknown) {
    const branch = id.parse(branchId),
      type = id.parse(typeId),
      input = roomPriceInputSchema.parse(body),
      repository = this.repository.pricing();
    return this.idempotency
      .execute(
        {
          actor,
          key,
          endpoint: 'POST /branches/:branchId/inventory/room-types/:roomTypeId/prices',
          status: 201,
        },
        { branch, type },
        input,
        roomPriceVersionSchema,
        async (tx) => {
          await repository.authorize(tx, actor, branch, type, true);
          return true;
        },
        () => repository.schedule(requireTransaction(), actor, branch, type, input),
      )
      .catch(inventoryFailure);
  }
  duplicate(actor: Actor, key: string, branchId: string, roomId: string, body: unknown) {
    const branch = id.parse(branchId),
      room = id.parse(roomId),
      input = roomDuplicationInputSchema.parse(body),
      repository = this.repository.duplication();
    return this.idempotency
      .execute(
        {
          actor,
          key,
          endpoint: 'POST /branches/:branchId/inventory/rooms/:roomId/duplicate',
          status: 201,
        },
        { branch, room },
        input,
        roomDuplicationResultSchema,
        async (transaction) => {
          await repository.authorize(transaction, actor, branch, room);
          return true;
        },
        () =>
          repository.duplicate(
            requireTransaction(),
            actor,
            branch,
            room,
            duplicationRoomNumbers(input),
          ),
      )
      .catch(inventoryFailure);
  }
  constructor(
    private readonly repository: InventoryRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  read(actor: Actor, branchId: string) {
    return this.repository.read(actor, id.parse(branchId));
  }
  access(actor: Actor, branchId: string, query: unknown = {}) {
    z.object({}).strict().parse(query);
    return this.repository.access(actor, id.parse(branchId));
  }
  page(actor: Actor, branchId: string, kind: InventoryPageKind, query: unknown, parentId?: string) {
    return this.repository.page(
      actor,
      id.parse(branchId),
      inventoryPageKindSchema.parse(kind),
      inventoryPageQuerySchema.parse(query),
      parentId === undefined ? undefined : id.parse(parentId),
    );
  }
  roomType(actor: Actor, key: string, branchId: string, body: unknown, roomTypeId?: string) {
    const input = roomTypeInputSchema.parse(body),
      typeId = roomTypeId ? id.parse(roomTypeId) : undefined;
    return this.execute(
      actor,
      key,
      branchId,
      typeId ? 'PUT /room-types/:roomTypeId' : 'POST /room-types',
      { input, ...(typeId ? { typeId } : {}) },
      (transaction) => this.repository.roomType(transaction, actor, branchId, input, typeId),
    );
  }
  room(actor: Actor, key: string, branchId: string, body: unknown) {
    const input = roomInputSchema.parse(body);
    return this.execute(actor, key, branchId, 'POST /rooms', input, (transaction) =>
      this.repository.room(transaction, actor, branchId, input),
    );
  }
  seat(actor: Actor, key: string, branchId: string, roomId: string, body: unknown) {
    const input = seatInputSchema.parse(body),
      room = id.parse(roomId);
    return this.execute(
      actor,
      key,
      branchId,
      'POST /rooms/:roomId/seats',
      { room, input },
      (transaction) => this.repository.seat(transaction, actor, branchId, room, input),
      input.monthlyRentPaisa !== undefined,
    );
  }
  state(
    actor: Actor,
    key: string,
    branchId: string,
    kind: 'room' | 'seat',
    resourceId: string,
    body: unknown,
  ) {
    const target = { kind: z.enum(['room', 'seat']).parse(kind), id: id.parse(resourceId) };
    const input = inventoryStateInputSchema.parse(body);
    return this.execute(
      actor,
      key,
      branchId,
      'PUT /' + target.kind + '/status',
      { target, input },
      (transaction) =>
        this.repository.state(transaction, actor, branchId, target, input.status, input.reason),
    );
  }
  archive(
    actor: Actor,
    key: string,
    branchId: string,
    kind: 'room_type' | 'room' | 'seat',
    resourceId: string,
    body: unknown,
  ) {
    const target = {
      kind: z.enum(['room_type', 'room', 'seat']).parse(kind),
      id: id.parse(resourceId),
    };
    const input = inventoryArchiveInputSchema.parse(body);
    const endpoint =
      target.kind === 'room_type'
        ? 'POST /room-types/archive'
        : 'POST /' + target.kind + '/archive';
    return this.execute(actor, key, branchId, endpoint, { target, input }, (transaction) =>
      this.repository.archive(transaction, actor, branchId, target, input.reason),
    );
  }
  private execute(
    actor: Actor,
    key: string,
    branchId: string,
    endpoint: string,
    input: unknown,
    work: (transaction: Transaction) => Promise<unknown>,
    pricing = false,
  ) {
    const branch = id.parse(branchId);
    return this.idempotency
      .execute(
        { actor, key, endpoint: 'inventory ' + endpoint, status: 200 },
        { branchId: branch },
        input,
        inventoryMutationSchema,
        async (transaction) => {
          await this.repository.authorize(transaction, actor, branch, 'inventory_edit');
          if (pricing || endpoint.includes('room-types'))
            await this.repository.authorize(transaction, actor, branch, 'pricing_edit');
          return true;
        },
        () => work(requireTransaction()),
      )
      .catch(inventoryFailure);
  }
}
