import { and, eq, gt, ne } from 'drizzle-orm';
import { cities, areas, type Database } from '@hsm/db';
import { DomainError, type ManagementPage, type AreaPageInput } from '@hsm/contracts';
import { lockActor } from '../auth/actor-lock.js';
import type { Actor } from '../authorization/store.js';
import { ScopeRepository } from '../authorization/repository.js';
import type { Transaction } from '../audit/writer.js';
const unavailable = () => new DomainError('NOT_FOUND', 404, 'Geography unavailable');
export class GeographyReadRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  private async authorize(transaction: Transaction, actor: Actor) {
    await lockActor(transaction, actor, this.clock);
    if (!(await new ScopeRepository(transaction).owner(actor.userId)))
      throw new DomainError('FORBIDDEN', 403, 'Owner unavailable');
  }
  cities(actor: Actor, page: ManagementPage) {
    return this.database.transaction(async (transaction) => {
      await this.authorize(transaction, actor);
      return transaction
        .select({ id: cities.id, name: cities.name })
        .from(cities)
        .where(and(eq(cities.isActive, true), page.cursor ? gt(cities.id, page.cursor) : undefined))
        .orderBy(cities.id)
        .limit(page.limit + 1);
    });
  }
  private async requireCity(transaction: Transaction, cityId: string) {
    const [city] = await transaction
      .select({ id: cities.id })
      .from(cities)
      .where(and(eq(cities.id, cityId), eq(cities.isActive, true)));
    if (!city) throw unavailable();
  }
  private async requireParent(transaction: Transaction, cityId: string, parentId: string) {
    const [parent] = await transaction
      .select({ id: areas.id })
      .from(areas)
      .where(
        and(
          eq(areas.id, parentId),
          eq(areas.cityId, cityId),
          eq(areas.isActive, true),
          ne(areas.level, 'sub_area'),
        ),
      );
    if (!parent) throw unavailable();
  }
  areas(actor: Actor, cityId: string, page: AreaPageInput) {
    return this.database.transaction(async (transaction) => {
      await this.authorize(transaction, actor);
      await this.requireCity(transaction, cityId);
      if (page.parentId) await this.requireParent(transaction, cityId, page.parentId);
      return transaction
        .select({
          id: areas.id,
          name: areas.name,
          cityId: areas.cityId,
          parentId: areas.parentId,
          level: areas.level,
        })
        .from(areas)
        .where(
          and(
            eq(areas.cityId, cityId),
            eq(areas.isActive, true),
            page.parentId
              ? and(eq(areas.parentId, page.parentId), eq(areas.level, 'sub_area'))
              : ne(areas.level, 'sub_area'),
            page.cursor ? gt(areas.id, page.cursor) : undefined,
          ),
        )
        .orderBy(areas.id)
        .limit(page.limit + 1);
    });
  }
}
