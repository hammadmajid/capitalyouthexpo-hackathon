import { and, desc, eq, isNotNull, lte, sql, type SQLWrapper } from 'drizzle-orm';
import { bedPrices } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { pakistanToday } from '../booking/policy.js';
type Reader = Pick<Transaction, 'select'>;
function depositQuery(
  database: Reader,
  branch: string | SQLWrapper,
  bed: string | SQLWrapper,
  now: Date,
) {
  return database
    .select({ amount: bedPrices.depositPaisa })
    .from(bedPrices)
    .where(
      and(
        eq(bedPrices.branchId, branch),
        eq(bedPrices.bedId, bed),
        isNotNull(bedPrices.depositPaisa),
        lte(bedPrices.effectiveFrom, pakistanToday(now)),
      ),
    )
    .orderBy(desc(bedPrices.effectiveFrom), desc(bedPrices.id))
    .limit(1);
}
// Omitted historical presets inherit the last explicit bed security, then legacy type terms.
export function bedDepositSql(
  database: Reader,
  branch: string | SQLWrapper,
  bed: string | SQLWrapper,
  fallback: SQLWrapper | bigint,
  now = new Date(),
) {
  return sql<bigint>`coalesce((${depositQuery(database, branch, bed, now)}), ${fallback})`.mapWith({
    mapFromDriverValue: (value: unknown) => BigInt(String(value)),
  });
}
export async function resolveBedDeposit(
  database: Reader,
  branch: string,
  bed: string,
  fallback: bigint,
  now: Date,
) {
  const [selected] = await depositQuery(database, branch, bed, now);
  return selected?.amount ?? fallback;
}
