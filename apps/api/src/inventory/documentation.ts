import type { SchemaObject } from '@nestjs/swagger';
export const object = (
  properties: Record<string, SchemaObject>,
  optional: string[] = [],
): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties).filter((key) => !optional.includes(key)),
});
export const identifier: SchemaObject = { type: 'string', format: 'uuid' };
export const money: SchemaObject = {
  type: 'integer',
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
};
export const nullable = (schema: SchemaObject): SchemaObject => ({
  anyOf: [schema, { type: 'null' }],
});
export const status: SchemaObject = { type: 'string', enum: ['active', 'inactive', 'maintenance'] };
const label: SchemaObject = { type: 'string', minLength: 1, maxLength: 80 };
export const feeDocumentation = object({
  code: { type: 'string', enum: ['mess', 'utilities', 'admission'] },
  cadence: { type: 'string', enum: ['monthly', 'one_time'] },
  amountPaisa: money,
});
export const typeInputDocumentation = object({
  name: { type: 'string', minLength: 1, maxLength: 120 },
  inventoryMode: { type: 'string', enum: ['per_bed', 'whole_room', 'both'] },
  capacity: { type: 'integer', minimum: 1, maximum: 2147483646 },
  bedMonthlyRentPaisa: nullable(money),
  roomMonthlyRentPaisa: nullable(money),
  depositPaisa: money,
  fees: { type: 'array', maxItems: 32, items: feeDocumentation },
});
export const typeSummaryDocumentation = {
  ...typeInputDocumentation.properties,
  capacity: { type: 'integer' as const, minimum: 0, maximum: 2147483646 },
  setupManaged: { type: 'boolean' as const },
};
export const roomInputDocumentation = object({ roomTypeId: identifier, label, status });
export const seatInputDocumentation = object(
  { label, status, monthlyRentPaisa: money, depositPaisa: money },
  ['monthlyRentPaisa', 'depositPaisa'],
);
export const mutationDocumentation = object({
  id: identifier,
  branchId: identifier,
  kind: {
    type: 'string',
    enum: ['room_type', 'room', 'seat', 'policy', 'block', 'media', 'manager_grants'],
  },
});
const archive = nullable({ type: 'string', format: 'date-time' });
export const branchInventoryDocumentation = object({
  permissions: {
    type: 'array',
    items: {
      type: 'string',
      enum: [
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
      ],
    },
  },
  canConfigureManagers: { type: 'boolean' },
  roomTypes: {
    type: 'array',
    items: object(
      {
        ...typeSummaryDocumentation,
        id: identifier,
        branchId: identifier,
        archivedAt: archive,
      },
      ['setupManaged'],
    ),
  },
  rooms: {
    type: 'array',
    items: object(
      {
        ...roomInputDocumentation.properties,
        id: identifier,
        branchId: identifier,
        archivedAt: archive,
        capacity: { type: 'integer', minimum: 0 },
        seats: {
          type: 'array',
          items: object(
            {
              ...seatInputDocumentation.properties,
              monthlyRentPaisa: nullable(money),
              id: identifier,
              roomId: identifier,
              ordinal: { type: 'integer', minimum: 1 },
              archivedAt: archive,
            },
            ['monthlyRentPaisa', 'depositPaisa'],
          ),
        },
      },
      ['capacity'],
    ),
  },
});
