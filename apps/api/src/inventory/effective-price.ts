import { and, desc, eq, lte } from 'drizzle-orm';
import { roomTypePrices, roomTypeFees, type roomTypes } from '@hsm/db';
import { disclosedFeeSchema, money, moneyToJson } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { pakistanToday } from '../booking/policy.js';

export async function effectivePrice(
  tx: Transaction,
  type: typeof roomTypes.$inferSelect,
  now: Date,
) {
  const [version] = await tx
    .select()
    .from(roomTypePrices)
    .where(
      and(
        eq(roomTypePrices.branchId, type.branchId),
        eq(roomTypePrices.roomTypeId, type.id),
        lte(roomTypePrices.effectiveFrom, pakistanToday(now)),
      ),
    )
    .orderBy(desc(roomTypePrices.effectiveFrom))
    .limit(1);
  if (version) return version;
  const fees = await tx
    .select()
    .from(roomTypeFees)
    .where(and(eq(roomTypeFees.branchId, type.branchId), eq(roomTypeFees.roomTypeId, type.id)))
    .orderBy(roomTypeFees.code, roomTypeFees.cadence);
  return {
    ...type,
    fees: disclosedFeeSchema.array().parse(
      fees.map((fee) => ({
        code: fee.code,
        cadence: fee.cadence,
        amountPaisa: moneyToJson(money(fee.amountPaisa)),
      })),
    ),
  };
}
