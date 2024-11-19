import { z } from 'zod';
import { inventoryModeSchema } from './booking-policy.js';
import { disclosedFeeSchema } from './booking-quote.js';
import { moneyJsonSchema } from './money.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const inventoryStatusSchema = z.enum(['active', 'inactive', 'maintenance']);
export const inventoryPermissionSchema = z.enum([
  'listing_edit',
  'inventory_edit',
  'pricing_edit',
  'policy_edit',
  'media_publish',
  'block_manage',
  'booking_manage',
  'document_review',
  'stay_manage',
  'rent_manage',
  'payment_record',
  'finance_view',
  'checkout_manage',
  // CHG-039: Owner-granted only; never part of the automatic full-branch grant.
  'staff_manage',
  'staff_payroll_manage',
]);
export type InventoryPermission = z.infer<typeof inventoryPermissionSchema>;
const roomTypeFields = z
  .object({
    name: z.string().trim().min(1).max(120),
    inventoryMode: inventoryModeSchema,
    capacity: z.number().int().positive().max(2147483646),
    bedMonthlyRentPaisa: moneyJsonSchema.nullable(),
    roomMonthlyRentPaisa: moneyJsonSchema.nullable(),
    depositPaisa: moneyJsonSchema,
    fees: z
      .array(disclosedFeeSchema)
      .max(32)
      .refine(
        (value) => new Set(value.map((fee) => fee.code + ':' + fee.cadence)).size === value.length,
      ),
  })
  .strict();
function requireModePrices(value: z.infer<typeof roomTypeFields>, context: z.RefinementCtx) {
  if (value.inventoryMode !== 'whole_room' && value.bedMonthlyRentPaisa === null)
    context.addIssue({
      code: 'custom',
      path: ['bedMonthlyRentPaisa'],
      message: 'Bed price is required',
    });
  if (value.inventoryMode !== 'per_bed' && value.roomMonthlyRentPaisa === null)
    context.addIssue({
      code: 'custom',
      path: ['roomMonthlyRentPaisa'],
      message: 'Room price is required',
    });
}
export const roomTypeInputSchema = roomTypeFields.superRefine(requireModePrices);
export const roomTypeSummarySchema = roomTypeFields
  .extend({
    capacity: z.number().int().nonnegative().max(2147483646),
    setupManaged: z.boolean().optional(),
    id,
    branchId: id,
    archivedAt: z.string().datetime().nullable(),
  })
  .superRefine((value, context) => {
    if (!value.setupManaged) requireModePrices(value, context);
    else if (value.inventoryMode !== 'per_bed')
      context.addIssue({
        code: 'custom',
        path: ['inventoryMode'],
        message: 'Setup rooms use individual beds',
      });
  });
export const roomInputSchema = z
  .object({
    roomTypeId: id,
    label: z.string().trim().min(1).max(80),
    status: inventoryStatusSchema,
  })
  .strict();
export const seatInputSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    status: inventoryStatusSchema,
    monthlyRentPaisa: moneyJsonSchema.optional(),
    depositPaisa: moneyJsonSchema.optional(),
  })
  .strict()
  .refine((value) => value.depositPaisa === undefined || value.monthlyRentPaisa !== undefined, {
    path: ['monthlyRentPaisa'],
    message: 'Set this bed rent with its security deposit',
  });
export const inventoryStateInputSchema = z
  .object({ status: inventoryStatusSchema, reason: z.string().trim().min(1).max(500) })
  .strict();
export const inventoryArchiveInputSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();
export const inventoryMutationSchema = z
  .object({
    id,
    branchId: id,
    kind: z.enum(['room_type', 'room', 'seat', 'policy', 'block', 'media', 'manager_grants']),
  })
  .strict();
export const seatSummarySchema = z
  .object({
    id,
    roomId: id,
    label: z.string(),
    ordinal: z.number().int().positive(),
    monthlyRentPaisa: moneyJsonSchema.nullable().optional(),
    depositPaisa: moneyJsonSchema.optional(),
    status: inventoryStatusSchema,
    archivedAt: z.string().datetime().nullable(),
  })
  .strict();
export const roomSummarySchema = z
  .object({
    id,
    branchId: id,
    roomTypeId: id,
    capacity: z.number().int().nonnegative().optional(),
    label: z.string(),
    status: inventoryStatusSchema,
    archivedAt: z.string().datetime().nullable(),
    seats: z.array(seatSummarySchema),
  })
  .strict();
export const branchInventorySchema = z
  .object({
    roomTypes: z.array(roomTypeSummarySchema),
    rooms: z.array(roomSummarySchema),
    permissions: z.array(inventoryPermissionSchema),
    canConfigureManagers: z.boolean(),
  })
  .strict();
export type RoomTypeInput = z.infer<typeof roomTypeInputSchema>;
export type RoomInput = z.infer<typeof roomInputSchema>;
export type SeatInput = z.infer<typeof seatInputSchema>;

export const managerInventoryGrantInputSchema = z
  .object({
    permissions: z
      .array(inventoryPermissionSchema)
      .max(inventoryPermissionSchema.options.length)
      .refine((value) => new Set(value).size === value.length),
  })
  .strict();

export const managerInventoryGrantStateSchema = managerInventoryGrantInputSchema.extend({
  branchId: id,
  assignmentId: id,
});
export type ManagerInventoryGrantState = z.infer<typeof managerInventoryGrantStateSchema>;
