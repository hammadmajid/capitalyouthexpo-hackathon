import { z } from 'zod';
import {
  DomainError,
  listingSummarySchema,
  listingPageSchema,
  marketplacePageSchema,
  marketplaceSortKeyCount,
  encodeMarketplaceSortCursor,
  type MarketplaceSort,
  type MarketplaceQuery,
  money,
  moneyToJson,
  publicRoomAmenityListSchema,
} from '@hsm/contracts';
const decimal = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .max(32);
const rawSchema = listingSummarySchema
  .omit({
    verified: true,
    priceFromPaisa: true,
    availableBeds: true,
    availableWholeRooms: true,
    amenities: true,
  })
  .extend({
    priceFromPaisa: decimal.nullable(),
    availableBeds: decimal.nullable(),
    availableWholeRooms: decimal.nullable(),
    amenities: publicRoomAmenityListSchema,
  })
  .strict();
function invalid(): never {
  throw new DomainError('INTERNAL', 500, 'Invalid public discovery metadata');
}
function count(value: string | null) {
  if (value === null) return null;
  const integer = BigInt(value);
  if (integer > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
  return Number(integer);
}
function withoutKeys(input: unknown) {
  if (typeof input !== 'object' || input === null) return input;
  const row = { ...(input as Record<string, unknown>) };
  delete row.sortKeys;
  return row;
}
export function projectDiscoveryRow(input: unknown, dated: boolean) {
  const parsed = rawSchema.safeParse(withoutKeys(input));
  if (!parsed.success) return invalid();
  const row = parsed.data;
  if ((row.availableBeds === null) !== !dated || (row.availableWholeRooms === null) !== !dated)
    invalid();
  let price: number | null = null;
  try {
    if (row.priceFromPaisa !== null) price = moneyToJson(money(BigInt(row.priceFromPaisa)));
  } catch {
    return invalid();
  }
  const result = listingSummarySchema.safeParse({
    ...row,
    priceFromPaisa: price,
    availableBeds: count(row.availableBeds),
    availableWholeRooms: count(row.availableWholeRooms),
    verified: true,
  });
  if (!result.success) return invalid();
  return result.data;
}
export function projectDiscoveryPage(
  rows: unknown[],
  limit: number,
  dated: boolean,
  cursor?: string,
  requestedIds?: string[],
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || rows.length > limit + 1) invalid();
  const projected = rows.map((row) => projectDiscoveryRow(row, dated));
  if (
    new Set(projected.map((row) => row.branchId)).size !== projected.length ||
    projected.some((row, index) => {
      const before = projected[index - 1]?.branchId ?? cursor;
      return (
        (before !== undefined && row.branchId <= before) ||
        (requestedIds !== undefined && !requestedIds.includes(row.branchId))
      );
    })
  )
    invalid();
  const data = projected.slice(0, limit);
  return listingPageSchema.parse({
    data,
    nextCursor: projected.length > limit ? data.at(-1)?.branchId : null,
  });
}
const keysSchema = z.array(z.string().regex(/^-?(0|[1-9][0-9]{0,15})$/)).length(3);
function compare(left: number[], right: number[]) {
  for (const [index, value] of left.entries()) {
    const other = right[index] ?? 0;
    if (value !== other) return value < other ? -1 : 1;
  }
  return 0;
}
// p.13: sorted pages must follow their integer keyset exactly and continue from the last row.
export function projectSortedDiscoveryPage(
  rows: unknown[],
  limit: number,
  dated: boolean,
  sort: MarketplaceSort,
  requestedIds?: string[],
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || rows.length > limit + 1) invalid();
  const count = marketplaceSortKeyCount[sort];
  const keyed = rows.map((row) => {
    const parsed = keysSchema.safeParse((row as { sortKeys?: unknown } | null)?.sortKeys);
    if (!parsed.success) return invalid();
    const keys = parsed.data.slice(0, count).map(Number);
    if (keys.some((key) => !Number.isSafeInteger(key) && key !== 2 ** 53)) invalid();
    return { row: projectDiscoveryRow(row, dated), keys };
  });
  if (
    new Set(keyed.map((entry) => entry.row.branchId)).size !== keyed.length ||
    keyed.some((entry, index) => {
      const previous = keyed[index - 1];
      const order = previous ? compare(previous.keys, entry.keys) : -1;
      return (
        order > 0 ||
        (order === 0 && previous !== undefined && previous.row.branchId >= entry.row.branchId) ||
        (requestedIds !== undefined && !requestedIds.includes(entry.row.branchId))
      );
    })
  )
    invalid();
  const data = keyed.slice(0, limit),
    last = data.at(-1);
  return marketplacePageSchema.parse({
    data: data.map((entry) => entry.row),
    nextCursor:
      keyed.length > limit && last
        ? encodeMarketplaceSortCursor(sort, last.keys, last.row.branchId)
        : null,
  });
}
export function discoveryPage(rows: unknown[], input: MarketplaceQuery) {
  const dated = input.moveInDate !== undefined && input.moveOutDate !== undefined;
  return input.sort
    ? projectSortedDiscoveryPage(rows, input.limit, dated, input.sort, input.ids)
    : projectDiscoveryPage(rows, input.limit, dated, input.cursor, input.ids);
}
