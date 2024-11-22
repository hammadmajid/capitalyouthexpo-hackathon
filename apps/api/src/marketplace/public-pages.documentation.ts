import { object, identifier, money, nullable } from '../inventory/documentation.js';
const text = { type: 'string' as const },
  boolean = nullable({ type: 'boolean' }),
  photoIds = { type: 'array' as const, minItems: 1, maxItems: 12, items: identifier };
export const publicTypeDocumentation = object({
  id: identifier,
  name: text,
  capacity: { type: 'integer', minimum: 1 },
  inventoryMode: { type: 'string', enum: ['per_bed', 'whole_room', 'both'] },
  bedMonthlyRentPaisa: nullable(money),
  roomMonthlyRentPaisa: nullable(money),
  depositPaisa: money,
  fees: {
    type: 'array',
    maxItems: 32,
    items: object({
      code: { type: 'string', enum: ['mess', 'utilities', 'admission'] },
      cadence: { type: 'string', enum: ['monthly', 'one_time'] },
      amountPaisa: money,
    }),
  },
  amenities: { type: 'array', maxItems: 100, items: object({ code: text, name: text }) },
});
export const publicRoomDocumentation = object(
  {
    capacity: { type: 'integer', minimum: 0 },
    id: identifier,
    label: text,
    wholeRoomAvailable: boolean,
    photoIds,
  },
  ['capacity'],
);
export const publicBedDocumentation = object(
  {
    id: identifier,
    label: text,
    available: boolean,
    photoIds,
    monthlyRentPaisa: nullable(money),
    depositPaisa: money,
  },
  ['monthlyRentPaisa', 'depositPaisa'],
);
export const publicTypePageDocumentation = object({
  branchId: identifier,
  data: { type: 'array', maxItems: 100, items: publicTypeDocumentation },
  nextCursor: nullable(identifier),
});
export const publicRoomPageDocumentation = object({
  branchId: identifier,
  roomTypeId: identifier,
  data: { type: 'array', maxItems: 100, items: publicRoomDocumentation },
  nextCursor: nullable(identifier),
});
export const publicBedPageDocumentation = object({
  branchId: identifier,
  roomId: identifier,
  data: { type: 'array', maxItems: 100, items: publicBedDocumentation },
  nextCursor: nullable(identifier),
});
