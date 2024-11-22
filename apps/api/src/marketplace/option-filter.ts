import { and, eq, gte, lte, or, sql, type Column, type SQLWrapper } from 'drizzle-orm';
import type { MarketplaceQuery } from '@hsm/contracts';
type TypeTable = Record<
  'inventoryMode' | 'bedMonthlyRentPaisa' | 'roomMonthlyRentPaisa' | 'depositPaisa' | 'capacity',
  Column
>;
type Filters = Pick<
  MarketplaceQuery,
  'minimumRentPaisa' | 'maximumRentPaisa' | 'maximumDepositPaisa' | 'capacity' | 'optionKind'
>;
export function optionFiltersRequested(input: Filters) {
  return (
    input.minimumRentPaisa !== undefined ||
    input.maximumRentPaisa !== undefined ||
    input.maximumDepositPaisa !== undefined ||
    input.capacity !== undefined ||
    input.optionKind !== undefined
  );
}
// p.13: one room/bed option must match every rent, deposit, seater and option-kind filter.
export function optionTypeCondition(
  type: TypeTable,
  input: Filters,
  kind: 'bed' | 'room',
  bedRent?: SQLWrapper,
  physicalCapacity?: SQLWrapper,
  bedDeposit?: SQLWrapper,
) {
  if (input.optionKind !== undefined && input.optionKind !== kind) return sql<boolean>`false`;
  const rent = kind === 'bed' ? (bedRent ?? type.bedMonthlyRentPaisa) : type.roomMonthlyRentPaisa;
  return and(
    kind === 'bed'
      ? or(eq(type.inventoryMode, 'per_bed'), eq(type.inventoryMode, 'both'))
      : or(eq(type.inventoryMode, 'whole_room'), eq(type.inventoryMode, 'both')),
    gte(rent, BigInt(input.minimumRentPaisa ?? 0)),
    lte(rent, BigInt(input.maximumRentPaisa ?? Number.MAX_SAFE_INTEGER)),
    input.maximumDepositPaisa !== undefined
      ? lte(
          kind === 'bed' ? (bedDeposit ?? type.depositPaisa) : type.depositPaisa,
          BigInt(input.maximumDepositPaisa),
        )
      : undefined,
    input.capacity !== undefined
      ? eq(physicalCapacity ?? type.capacity, input.capacity)
      : undefined,
  );
}
