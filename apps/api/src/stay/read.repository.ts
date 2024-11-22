import { and, eq } from 'drizzle-orm';
import { stays, type Database } from '@hsm/db';
import {
  DomainError,
  stayPageSchema,
  type CustomerStayQuery,
  type StayReadQuery,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { inventoryPageRows } from '../inventory/page-projection.js';
import { projectStay, projectStayDetail } from './read-projection.js';
import { stayReadSelect, staffStayFilter, stayReadFilter } from './read-query.js';
export class StayReadRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  staffPage(actor: Actor, branchId: string, query: StayReadQuery) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      await lockInventoryScope(transaction, actor, branchId, 'stay_manage');
      await lockActor(transaction, actor, this.clock);
      const rows = await stayReadSelect(transaction)
        .where(and(eq(stays.branchId, branchId), staffStayFilter(query)))
        .orderBy(stays.id)
        .limit(query.limit + 1);
      if (rows.some((row) => row.stay.branchId !== branchId))
        throw new DomainError('INTERNAL', 500, 'Stay scope unavailable');
      return stayPageSchema.parse(inventoryPageRows(rows.map(projectStay), query));
    });
  }
  customerPage(actor: Actor, query: CustomerStayQuery) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      const rows = await stayReadSelect(transaction)
        .where(and(eq(stays.userId, actor.userId), stayReadFilter(query)))
        .orderBy(stays.id)
        .limit(query.limit + 1);
      if (rows.some((row) => row.stay.userId !== actor.userId))
        throw new DomainError('INTERNAL', 500, 'Stay scope unavailable');
      return stayPageSchema.parse(inventoryPageRows(rows.map(projectStay), query));
    });
  }
  staffDetail(actor: Actor, branchId: string, stayId: string) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      await lockInventoryScope(transaction, actor, branchId, 'stay_manage');
      await lockActor(transaction, actor, this.clock);
      const [row] = await stayReadSelect(transaction)
        .where(and(eq(stays.branchId, branchId), eq(stays.id, stayId)))
        .limit(1);
      if (!row) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
      if (row.stay.branchId !== branchId || row.stay.id !== stayId)
        throw new DomainError('INTERNAL', 500, 'Stay scope unavailable');
      return projectStayDetail(row);
    });
  }
  customerDetail(actor: Actor, stayId: string) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      const [row] = await stayReadSelect(transaction)
        .where(and(eq(stays.userId, actor.userId), eq(stays.id, stayId)))
        .limit(1);
      if (!row) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
      if (row.stay.userId !== actor.userId || row.stay.id !== stayId)
        throw new DomainError('INTERNAL', 500, 'Stay scope unavailable');
      return projectStayDetail(row);
    });
  }
}
