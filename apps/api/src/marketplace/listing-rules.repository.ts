import type { Database } from '@hsm/db';
import {
  DomainError,
  decodeListingRuleCursor,
  listingRuleSequenceIsValid,
  encodeListingRuleCursor,
  publicListingRuleSchema,
  publicListingRulesPageSchema,
  type PublicListingRulesQuery,
} from '@hsm/contracts';
import { readPublicListingRulesRows } from './listing-rules-query.js';
export class PublicListingRulesRepository {
  constructor(private readonly database: Database) {}
  read(branchId: string, input: PublicListingRulesQuery) {
    return this.database.transaction(async (transaction) => {
      const rows = await readPublicListingRulesRows(transaction, branchId, input);
      if (!rows.length) throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
      if (rows.length > input.limit + 1 || rows.some((row) => row.branchId !== branchId))
        throw new DomainError('INTERNAL', 500, 'Invalid public listing rules');
      const first = rows[0];
      if (
        rows.length === 1 &&
        first?.id === null &&
        first.body === null &&
        first.sortOrder === null
      )
        return publicListingRulesPageSchema.parse({ branchId, data: [], nextCursor: null });
      const projected = rows.map((row) => {
        const parsed = publicListingRuleSchema.safeParse({
          id: row.id,
          body: row.body,
          sortOrder: row.sortOrder,
        });
        if (!parsed.success) throw new DomainError('INTERNAL', 500, 'Invalid public listing rules');
        return parsed.data;
      });
      if (
        !listingRuleSequenceIsValid(
          projected,
          input.cursor ? decodeListingRuleCursor(input.cursor) : undefined,
        )
      )
        throw new DomainError('INTERNAL', 500, 'Invalid public listing rules');
      const data = projected.slice(0, input.limit),
        last = data.at(-1);
      const parsed = publicListingRulesPageSchema.safeParse({
        branchId,
        data,
        nextCursor:
          projected.length > input.limit && last
            ? encodeListingRuleCursor(last.sortOrder, last.id)
            : null,
      });
      if (!parsed.success) throw new DomainError('INTERNAL', 500, 'Invalid public listing rules');
      return parsed.data;
    });
  }
}
