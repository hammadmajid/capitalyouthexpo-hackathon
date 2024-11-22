import { z } from 'zod';
import {
  stayIdentifierSchema as id,
  propertyPageQuerySchema,
  propertyBuildingInputSchema,
  propertyFloorInputSchema,
  propertyArchiveInputSchema,
  propertyRoomLocationInputSchema,
  propertyBuildingSchema,
  propertyFloorSchema,
  propertyRoomLocationSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import {
  PropertyStructureRepository,
  type PropertyTarget,
} from './property-structure.repository.js';

type Command<T> = {
  actor: Actor;
  key: string;
  branchId: string;
  endpoint: string;
  status: 200 | 201;
  target?: PropertyTarget;
  body: unknown;
  schema: z.ZodType<T>;
  relatedFloor?: string | null;
  work: (tx: Transaction) => Promise<T>;
};
export class PropertyStructureService {
  constructor(
    private readonly repository: PropertyStructureRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  buildings(actor: Actor, branchId: string, query: unknown) {
    return this.repository.buildingPage(
      actor,
      id.parse(branchId),
      propertyPageQuerySchema.parse(query),
    );
  }
  floors(actor: Actor, branchId: string, query: unknown) {
    return this.repository.floorPage(
      actor,
      id.parse(branchId),
      propertyPageQuerySchema.parse(query),
    );
  }
  room(actor: Actor, branchId: string, roomId: string, query: unknown) {
    z.object({}).strict().parse(query);
    return this.repository.roomLocation(actor, id.parse(branchId), id.parse(roomId));
  }
  createBuilding(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = id.parse(branchId),
      input = propertyBuildingInputSchema.parse(body);
    return this.command({
      actor,
      key,
      branchId: branch,
      endpoint: 'POST /branches/:branchId/property/buildings',
      status: 201,
      body: input,
      schema: propertyBuildingSchema,
      work: (tx) => this.repository.createBuilding(tx, actor, branch, input),
    });
  }
  createFloor(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = id.parse(branchId),
      input = propertyFloorInputSchema.parse(body);
    return this.command({
      actor,
      key,
      branchId: branch,
      endpoint: 'POST /branches/:branchId/property/floors',
      target: { kind: 'building', id: input.buildingId },
      status: 201,
      body: input,
      schema: propertyFloorSchema,
      work: (tx) => this.repository.createFloor(tx, actor, branch, input),
    });
  }
  archiveBuilding(actor: Actor, key: string, branchId: string, buildingId: string, body: unknown) {
    const branch = id.parse(branchId),
      building = id.parse(buildingId),
      input = propertyArchiveInputSchema.parse(body);
    return this.command({
      actor,
      key,
      branchId: branch,
      endpoint: 'POST /branches/:branchId/property/buildings/:buildingId/archive',
      target: { kind: 'building', id: building },
      status: 200,
      body: input,
      schema: propertyBuildingSchema,
      work: (tx) => this.repository.archiveBuilding(tx, actor, branch, building, input),
    });
  }
  archiveFloor(actor: Actor, key: string, branchId: string, floorId: string, body: unknown) {
    const branch = id.parse(branchId),
      floor = id.parse(floorId),
      input = propertyArchiveInputSchema.parse(body);
    return this.command({
      actor,
      key,
      branchId: branch,
      endpoint: 'POST /branches/:branchId/property/floors/:floorId/archive',
      target: { kind: 'floor', id: floor },
      status: 200,
      body: input,
      schema: propertyFloorSchema,
      work: (tx) => this.repository.archiveFloor(tx, actor, branch, floor, input),
    });
  }
  saveRoom(actor: Actor, key: string, branchId: string, roomId: string, body: unknown) {
    const branch = id.parse(branchId),
      room = id.parse(roomId),
      input = propertyRoomLocationInputSchema.parse(body);
    return this.command({
      actor,
      key,
      branchId: branch,
      endpoint: 'PUT /branches/:branchId/property/rooms/:roomId/location',
      target: { kind: 'room', id: room },
      status: 200,
      body: input,
      schema: propertyRoomLocationSchema,
      relatedFloor: input.floorId,
      work: (tx) => this.repository.saveRoomLocation(tx, actor, branch, room, input),
    });
  }
  private command<T>(c: Command<T>) {
    return this.idempotency.execute(
      { actor: c.actor, key: id.parse(c.key), endpoint: c.endpoint, status: c.status },
      { branchId: c.branchId, ...(c.target ?? { kind: 'branch' }) },
      c.body,
      c.schema,
      async (tx) => {
        // Replays check current actor/grants and exact branch/object authority;
        // post-command archival/version checks belong only in the write path.
        await this.repository.authorize(tx, c.actor, c.branchId, c.target);
        if (c.relatedFloor !== undefined && c.relatedFloor !== null)
          await this.repository.authorizeRelatedFloor(tx, c.branchId, c.relatedFloor);
        return true;
      },
      () => c.work(requireTransaction()),
    );
  }
}
