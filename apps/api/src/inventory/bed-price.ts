import { and, desc, eq, lte, sql, type SQLWrapper } from 'drizzle-orm';
import { bedPrices } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { pakistanToday } from '../booking/policy.js';
type Reader = Pick<Transaction, 'select'>;
export async function latestBedPrice(database: Reader, branchId: string, bedId: string, now: Date) {
  const [value] = await database
    .select()
    .from(bedPrices)
    .where(
      and(
        eq(bedPrices.branchId, branchId),
        eq(bedPrices.bedId, bedId),
        lte(bedPrices.effectiveFrom, pakistanToday(now)),
      ),
    )
    .orderBy(desc(bedPrices.effectiveFrom), desc(bedPrices.id))
    .limit(1);
  return value;
}
// The fallback is retained legacy type rent until management explicitly prices this bed.
export function bedRentSql(
  database: Reader,
  branch: string | SQLWrapper,
  bed: string | SQLWrapper,
  fallback: SQLWrapper | bigint | null,
  now = new Date(),
) {
  const selected = database
    .select({ amount: bedPrices.monthlyRentPaisa })
    .from(bedPrices)
    .where(
      and(
        eq(bedPrices.branchId, branch),
        eq(bedPrices.bedId, bed),
        lte(bedPrices.effectiveFrom, pakistanToday(now)),
      ),
    )
    .orderBy(desc(bedPrices.effectiveFrom), desc(bedPrices.id))
    .limit(1);
  return sql<bigint | null>`coalesce((${selected}), ${fallback})`.mapWith({
    mapFromDriverValue: (value: unknown): bigint | null =>
      value === null ? null : BigInt(String(value)),
  });
}
