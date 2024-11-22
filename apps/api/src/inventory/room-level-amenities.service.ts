import { z } from 'zod';
import {
  listingPreconditionSchema,
  roomLevelAmenitiesInputSchema,
  roomLevelAmenitiesStateSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { RoomLevelAmenitiesRepository } from './room-level-amenities.repository.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class RoomLevelAmenitiesService {
  constructor(
    private readonly repository: RoomLevelAmenitiesRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  read(actor: Actor, branchId: string, roomId: string, query: unknown = {}) {
    z.object({}).strict().parse(query);
    return this.repository.read(actor, id.parse(branchId), id.parse(roomId));
  }
  save(
    actor: Actor,
    key: string,
    branchId: string,
    roomId: string,
    ifMatch: unknown,
    body: unknown,
  ) {
    const branch = id.parse(branchId),
      room = id.parse(roomId),
      expectedVersion = listingPreconditionSchema.parse(ifMatch),
      parsed = roomLevelAmenitiesInputSchema.parse(body);
    const input =
      parsed.mode === 'custom'
        ? { mode: 'custom' as const, amenityCodes: [...parsed.amenityCodes].sort() }
        : parsed;
    return this.idempotency.execute(
      {
        actor,
        key,
        endpoint: 'PUT /branches/:branchId/rooms/:roomId/amenities',
        status: 200,
      },
      { branch, room },
      { expectedVersion, input },
      roomLevelAmenitiesStateSchema,
      async (transaction) => {
        await this.repository.authorize(transaction, actor, branch, room);
        return true;
      },
      () => this.repository.save(requireTransaction(), actor, branch, room, expectedVersion, input),
    );
  }
}
