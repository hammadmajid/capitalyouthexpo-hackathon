import { rentBoardPageSchema, rentBoardQuerySchema, stayIdentifierSchema } from '@hsm/contracts';
import type { Database } from '@hsm/db';
import type { Actor } from '../authorization/store.js';
import { RentBoardRepository } from './rent-board.repository.js';
export class RentBoardService {
  constructor(private readonly repository: RentBoardRepository) {}
  async page(actor: Actor, branchId: unknown, query: unknown) {
    return rentBoardPageSchema.parse(
      await this.repository.page(
        actor,
        stayIdentifierSchema.parse(branchId),
        rentBoardQuerySchema.parse(query),
      ),
    );
  }
}
export function rentBoardService(database: Database, clock: () => Date = () => new Date()) {
  return new RentBoardService(new RentBoardRepository(database, clock));
}
