import { z } from 'zod';
// p.13: organic sorts only. Rating sort waits for verified reviews (later phase).
export const marketplaceSortSchema = z.enum([
  'recommended',
  'nearest',
  'price_asc',
  'price_desc',
  'most_available',
]);
export type MarketplaceSort = z.infer<typeof marketplaceSortSchema>;
export const marketplaceSortKeyCount: Record<MarketplaceSort, number> = {
  recommended: 3,
  nearest: 1,
  price_asc: 1,
  price_desc: 1,
  most_available: 1,
};
const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const key = '-?(?:0|[1-9][0-9]{0,15})';
const pattern = new RegExp(`^([a-z_]+):(${key}(?:,${key}){0,3}):(${uuid})$`);
// Canonical keyset continuation: `<sort>:<integer keys>:<last branch UUID>`.
export const marketplaceSortCursorSchema = z
  .string()
  .max(160)
  .refine((value) => {
    const match = pattern.exec(value);
    if (!match?.[1] || !match[2]) return false;
    const sort = marketplaceSortSchema.safeParse(match[1]);
    if (!sort.success) return false;
    const keys = match[2].split(',').map(Number);
    return (
      keys.length === marketplaceSortKeyCount[sort.data] &&
      keys.every((value) => Number.isSafeInteger(value) || value === 2 ** 53)
    );
  }, 'Invalid marketplace continuation')
  .transform((value) => value.toLowerCase());
export function decodeMarketplaceSortCursor(input: string) {
  const [sort, keys, id] = marketplaceSortCursorSchema.parse(input).split(':');
  return {
    sort: marketplaceSortSchema.parse(sort),
    keys: (keys ?? '').split(',').map(Number),
    id: id ?? '',
  };
}
export function encodeMarketplaceSortCursor(sort: MarketplaceSort, keys: number[], id: string) {
  return marketplaceSortCursorSchema.parse(`${sort}:${keys.join(',')}:${id}`);
}
