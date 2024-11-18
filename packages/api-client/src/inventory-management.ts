import { z } from 'zod';
import {
  roomTypeInputSchema,
  roomInputSchema,
  seatInputSchema,
  inventoryStateInputSchema,
  inventoryArchiveInputSchema,
  inventoryMutationSchema,
  type RoomTypeInput,
  type RoomInput,
  type SeatInput,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = (value: string) => z.string().uuid().parse(value).toLowerCase();
type Mutation = z.infer<typeof inventoryMutationSchema>;
function checked(
  operation: Promise<Mutation>,
  branchId: string,
  kind: Mutation['kind'],
  targetId?: string,
) {
  return operation.then((result) => {
    if (
      result.branchId !== branchId ||
      result.kind !== kind ||
      (targetId !== undefined && result.id !== targetId)
    )
      throw new ClientFailure('INVALID_RESPONSE');
    return result;
  });
}
export function saveInventoryRoomType(
  client: ApiClient,
  branchId: string,
  input: RoomTypeInput,
  key: string,
  roomTypeId?: string,
) {
  const branch = id(branchId),
    body = roomTypeInputSchema.parse(input);
  const header = { 'Idempotency-Key': id(key) };
  if (roomTypeId !== undefined) {
    const target = id(roomTypeId);
    return checked(
      readApi(
        client.PUT('/v1/branches/{branchId}/inventory/room-types/{roomTypeId}', {
          params: { path: { branchId: branch, roomTypeId: target }, header },
          body,
        }),
        inventoryMutationSchema,
      ),
      branch,
      'room_type',
      target,
    );
  }
  return checked(
    readApi(
      client.POST('/v1/branches/{branchId}/inventory/room-types', {
        params: { path: { branchId: branch }, header },
        body,
      }),
      inventoryMutationSchema,
    ),
    branch,
    'room_type',
  );
}
export function createInventoryRoom(
  client: ApiClient,
  branchId: string,
  input: RoomInput,
  key: string,
) {
  const branch = id(branchId);
  return checked(
    readApi(
      client.POST('/v1/branches/{branchId}/inventory/rooms', {
        params: { path: { branchId: branch }, header: { 'Idempotency-Key': id(key) } },
        body: roomInputSchema.parse(input),
      }),
      inventoryMutationSchema,
    ),
    branch,
    'room',
  );
}
export function createInventoryBed(
  client: ApiClient,
  branchId: string,
  roomId: string,
  input: SeatInput,
  key: string,
) {
  const branch = id(branchId);
  const parsed = seatInputSchema.parse(input);
  return checked(
    readApi(
      client.POST('/v1/branches/{branchId}/inventory/rooms/{roomId}/seats', {
        params: {
          path: { branchId: branch, roomId: id(roomId) },
          header: { 'Idempotency-Key': id(key) },
        },
        body: {
          label: parsed.label,
          status: parsed.status,
          ...(parsed.depositPaisa === undefined ? {} : { depositPaisa: parsed.depositPaisa }),
          ...(parsed.monthlyRentPaisa === undefined
            ? {}
            : { monthlyRentPaisa: parsed.monthlyRentPaisa }),
        },
      }),
      inventoryMutationSchema,
    ),
    branch,
    'seat',
  );
}
const states = {
  room: '/v1/branches/{branchId}/inventory/rooms/{roomId}/status',
  seat: '/v1/branches/{branchId}/inventory/seats/{seatId}/status',
} as const;
export function changeInventoryState(
  client: ApiClient,
  branchId: string,
  kind: keyof typeof states,
  targetId: string,
  input: z.infer<typeof inventoryStateInputSchema>,
  key: string,
) {
  const branch = id(branchId),
    target = id(targetId),
    resource = z.enum(['room', 'seat']).parse(kind);
  return checked(
    readApi(
      client.PUT(states[resource], {
        params: {
          path: { branchId: branch, roomId: target, seatId: target },
          header: { 'Idempotency-Key': id(key) },
        },
        body: inventoryStateInputSchema.parse(input),
      }),
      inventoryMutationSchema,
    ),
    branch,
    resource,
    target,
  );
}
const archives = {
  room_type: '/v1/branches/{branchId}/inventory/room-types/{roomTypeId}/archive',
  room: '/v1/branches/{branchId}/inventory/rooms/{roomId}/archive',
  seat: '/v1/branches/{branchId}/inventory/seats/{seatId}/archive',
} as const;
export function archiveInventory(
  client: ApiClient,
  branchId: string,
  kind: keyof typeof archives,
  targetId: string,
  reason: string,
  key: string,
) {
  const branch = id(branchId),
    target = id(targetId),
    resource = z.enum(['room_type', 'room', 'seat']).parse(kind);
  return checked(
    readApi(
      client.POST(archives[resource], {
        params: {
          path: { branchId: branch, roomTypeId: target, roomId: target, seatId: target },
          header: { 'Idempotency-Key': id(key) },
        },
        body: inventoryArchiveInputSchema.parse({ reason }),
      }),
      inventoryMutationSchema,
    ),
    branch,
    resource,
    target,
  );
}
