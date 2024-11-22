import type { Database } from '@hsm/db';
import type { IdempotencyService } from '../idempotency/service.js';
import { PropertyStructureRepository } from './property-structure.repository.js';
import { PropertyStructureService } from './property-structure.service.js';
export function propertyStructureService(
  database: Database,
  idempotency: IdempotencyService,
  clock: () => Date = () => new Date(),
) {
  return new PropertyStructureService(
    new PropertyStructureRepository(database, undefined, clock),
    idempotency,
  );
}
