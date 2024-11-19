import { z } from 'zod';
import { calendarDateSchema } from './dates.js';
export const stayRangeSchema = z
  .object({
    moveInDate: calendarDateSchema,
    moveOutDate: calendarDateSchema,
  })
  .strict()
  .refine(
    (value) => value.moveInDate < value.moveOutDate,
    'Stay range must be nonempty and ordered',
  );
export type StayRange = z.infer<typeof stayRangeSchema>;
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const inventoryTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bed'), roomId: identifier, bedId: identifier }).strict(),
  z.object({ kind: z.literal('room'), roomId: identifier }).strict(),
]);
export type InventoryTarget = z.infer<typeof inventoryTargetSchema>;
export const inventoryConflictSchema = z
  .object({
    target: inventoryTargetSchema,
    range: stayRangeSchema,
    state: z.enum([
      'hold',
      'pending_request',
      'confirmed',
      'manual_block',
      'maintenance',
      'active_stay',
    ]),
    expiresAt: z.string().datetime().nullable(),
    reservesInventory: z.boolean(),
  })
  .strict()
  .refine(
    (value) =>
      ['hold', 'pending_request'].includes(value.state)
        ? value.expiresAt !== null
        : value.expiresAt === null,
    'Only transient claims have an expiry instant',
  );
export type InventoryConflict = z.infer<typeof inventoryConflictSchema>;
// ACC-001: [start,end); a room-wide target overlaps any bed, but different beds do not overlap.
export function stayRangesOverlap(left: unknown, right: unknown): boolean {
  const a = stayRangeSchema.parse(left);
  const b = stayRangeSchema.parse(right);
  return a.moveInDate < b.moveOutDate && b.moveInDate < a.moveOutDate;
}
export function inventoryTargetsOverlap(left: unknown, right: unknown): boolean {
  const a = inventoryTargetSchema.parse(left);
  const b = inventoryTargetSchema.parse(right);
  return a.roomId === b.roomId && (a.kind === 'room' || b.kind === 'room' || a.bedId === b.bedId);
}
export function inventoryIsAvailable(
  target: unknown,
  range: unknown,
  conflicts: readonly unknown[],
  now: Date,
): boolean {
  const wanted = inventoryTargetSchema.parse(target);
  const stay = stayRangeSchema.parse(range);
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid server clock');
  return !conflicts.some((input) => {
    const item = inventoryConflictSchema.parse(input);
    if (!item.reservesInventory) return false;
    if (item.expiresAt !== null && new Date(item.expiresAt).getTime() <= now.getTime())
      return false;
    return inventoryTargetsOverlap(wanted, item.target) && stayRangesOverlap(stay, item.range);
  });
}
