import { z } from 'zod';
import {
  listingPreconditionSchema,
  roomAmenitiesInputSchema,
  roomAmenitiesStateSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { RoomAmenitiesRepository } from './room-amenities.repository.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class RoomAmenitiesService {
  constructor(
    private readonly repository: RoomAmenitiesRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  read(actor: Actor, branchId: string, roomTypeId: string, query: unknown = {}) {
    z.object({}).strict().parse(query);
    return this.repository.read(actor, id.parse(branchId), id.parse(roomTypeId));
  }
  save(
    actor: Actor,
    key: string,
    branchId: string,
    roomTypeId: string,
    ifMatch: unknown,
    body: unknown,
  ) {
    const branch = id.parse(branchId),
      room = id.parse(roomTypeId),
      expectedVersion = listingPreconditionSchema.parse(ifMatch),
      parsed = roomAmenitiesInputSchema.parse(body);
    const input = { amenityCodes: [...parsed.amenityCodes].sort() };
    return this.idempotency.execute(
      {
        actor,
        key,
        endpoint: 'PUT /branches/:branchId/room-types/:roomTypeId/amenities',
        status: 200,
      },
      { branch, room },
      { expectedVersion, input },
      roomAmenitiesStateSchema,
      async (transaction) => {
        await this.repository.authorize(transaction, actor, branch, room);
        return true;
      },
      () => this.repository.save(requireTransaction(), actor, branch, room, expectedVersion, input),
    );
  }
}
