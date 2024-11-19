import { z } from 'zod';
import {
  inventoryPermissionSchema,
  roomSummarySchema,
  roomTypeSummarySchema,
  seatSummarySchema,
} from './inventory.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const inventoryPageQuerySchema = z
  .object({
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type InventoryPageQuery = z.infer<typeof inventoryPageQuerySchema>;
export const inventoryPageKindSchema = z.enum(['room_types', 'rooms', 'seats']);
export type InventoryPageKind = z.infer<typeof inventoryPageKindSchema>;
export const inventoryAccessSchema = z
  .object({
    branchId: id,
    permissions: z
      .array(inventoryPermissionSchema)
      .max(inventoryPermissionSchema.options.length)
      .refine((rows) => new Set(rows).size === rows.length),
    canConfigureManagers: z.boolean(),
  })
  .strict();
export function inventoryPageSequenceIsValid(rows: { id: string }[], after?: string) {
  return rows.every((row, index) => {
    const before = rows[index - 1]?.id ?? after;
    return before === undefined || before < row.id;
  });
}
function validPage(page: { data: { id: string }[]; nextCursor: string | null }) {
  return (
    inventoryPageSequenceIsValid(page.data) &&
    (page.nextCursor === null || page.data.at(-1)?.id === page.nextCursor)
  );
}
export const inventoryRoomRowSchema = roomSummarySchema.omit({ seats: true });
export const inventoryRoomTypePageSchema = inventoryAccessSchema
  .extend({
    data: z.array(roomTypeSummarySchema).max(100),
    nextCursor: id.nullable(),
  })
  .strict()
  .refine(validPage, 'Inventory rows must be ordered with an exact continuation')
  .refine(
    (page) => page.data.every((row) => row.branchId === page.branchId && row.archivedAt === null),
    'Inventory branch or archive mismatch',
  );
export const inventoryRoomPageSchema = inventoryAccessSchema
  .extend({
    roomTypeId: id,
    data: z.array(inventoryRoomRowSchema).max(100),
    nextCursor: id.nullable(),
  })
  .strict()
  .refine(validPage, 'Inventory rows must be ordered with an exact continuation')
  .refine(
    (page) =>
      page.data.every(
        (row) =>
          row.branchId === page.branchId &&
          row.roomTypeId === page.roomTypeId &&
          row.archivedAt === null,
      ),
    'Inventory parent or archive mismatch',
  );
export const inventorySeatPageSchema = inventoryAccessSchema
  .extend({
    roomId: id,
    data: z.array(seatSummarySchema).max(100),
    nextCursor: id.nullable(),
  })
  .strict()
  .refine(validPage, 'Inventory rows must be ordered with an exact continuation')
  .refine(
    (page) => page.data.every((row) => row.roomId === page.roomId && row.archivedAt === null),
    'Inventory parent or archive mismatch',
  );
export type InventoryAccess = z.infer<typeof inventoryAccessSchema>;
export type InventoryRoomTypePage = z.infer<typeof inventoryRoomTypePageSchema>;
export type InventoryRoomPage = z.infer<typeof inventoryRoomPageSchema>;
export type InventorySeatPage = z.infer<typeof inventorySeatPageSchema>;
