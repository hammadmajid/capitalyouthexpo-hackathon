import { and, eq, gt } from 'drizzle-orm';
import { favorites, type Database } from '@hsm/db';
import {
  DomainError,
  favoriteStateSchema,
  marketplaceQuerySchema,
  type ManagementPage,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { ScopeRepository } from '../authorization/repository.js';
import { publicBranch } from '../booking/projection.js';
import { MarketplaceRepository } from './repository.js';
export class FavoritesRepository {
  constructor(
    private readonly database: Database,
    private readonly marketplace: MarketplaceRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(transaction: Transaction, actor: Actor) {
    if (!(await new ScopeRepository(transaction).customer(actor.userId)))
      throw new DomainError('FORBIDDEN', 403, 'Customer scope required');
    return true;
  }
  list(actor: Actor, page: ManagementPage) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      await this.authorize(transaction, actor);
      const saved = await transaction
        .select({ branchId: favorites.branchId })
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, actor.userId),
            page.cursor ? gt(favorites.branchId, page.cursor) : undefined,
          ),
        )
        .orderBy(favorites.branchId)
        .limit(Math.min(page.limit, 20) + 1);
      const selected = saved.slice(0, Math.min(page.limit, 20));
      if (!selected.length) return { data: [], nextCursor: null };
      const result = await this.marketplace.list(
        marketplaceQuerySchema.parse({
          ids: selected.map((value) => value.branchId).join(','),
          limit: 20,
        }),
        transaction,
      );
      return {
        ...result,
        nextCursor: saved.length > selected.length ? (selected.at(-1)?.branchId ?? null) : null,
      };
    });
  }
  async save(transaction: Transaction, actor: Actor, branchId: string, saved: boolean) {
    if (saved) {
      if (!(await publicBranch(transaction, branchId)))
        throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
      await transaction
        .insert(favorites)
        .values({ userId: actor.userId, branchId, createdAt: this.clock() })
        .onConflictDoNothing();
    } else
      await transaction
        .delete(favorites)
        .where(and(eq(favorites.userId, actor.userId), eq(favorites.branchId, branchId)));
    return favoriteStateSchema.parse({ branchId, saved });
  }
}
