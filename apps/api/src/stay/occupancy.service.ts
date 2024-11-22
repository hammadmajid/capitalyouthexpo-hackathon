import {
  DomainError,
  bedHistoryQuerySchema,
  bedOccupancyHistoryPageSchema,
  bedOccupancyQuerySchema,
  bedOccupancySchema,
  occupancyPageSchema,
  occupancyQuerySchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Database } from '@hsm/db';
import type { Actor } from '../authorization/store.js';
import { OccupancyRepository } from './occupancy.repository.js';
export class OccupancyService {
  constructor(private readonly repository: OccupancyRepository) {}
  // BED-001 / RES-004: never return a projection that fails its own invariants.
  async page(actor: Actor, branchId: unknown, query: unknown) {
    const result = occupancyPageSchema.safeParse(
      await this.repository.page(
        actor,
        stayIdentifierSchema.parse(branchId),
        occupancyQuerySchema.parse(query),
      ),
    );
    if (!result.success) throw new DomainError('INTERNAL', 500, 'Occupancy data unavailable');
    return result.data;
  }
  async history(actor: Actor, branchId: unknown, bedId: unknown, query: unknown) {
    const result = bedOccupancyHistoryPageSchema.safeParse(
      await this.repository.history(
        actor,
        stayIdentifierSchema.parse(branchId),
        stayIdentifierSchema.parse(bedId),
        bedHistoryQuerySchema.parse(query),
      ),
    );
    if (!result.success) throw new DomainError('INTERNAL', 500, 'Bed history unavailable');
    return result.data;
  }
  async bed(actor: Actor, branchId: unknown, bedId: unknown, query: unknown) {
    const { on } = bedOccupancyQuerySchema.parse(query);
    const result = bedOccupancySchema.safeParse(
      await this.repository.bed(
        actor,
        stayIdentifierSchema.parse(branchId),
        stayIdentifierSchema.parse(bedId),
        on,
      ),
    );
    if (!result.success) throw new DomainError('INTERNAL', 500, 'Occupancy data unavailable');
    return result.data;
  }
}
export function occupancyService(database: Database, clock: () => Date = () => new Date()) {
  return new OccupancyService(new OccupancyRepository(database, clock));
}
