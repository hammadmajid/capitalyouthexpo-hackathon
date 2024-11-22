import { object, identifier, money, nullable, feeDocumentation } from './documentation.js';
export const priceInputDocumentation = object({
  effectiveFrom: { type: 'string', format: 'date' },
  bedMonthlyRentPaisa: nullable(money),
  roomMonthlyRentPaisa: nullable(money),
  depositPaisa: money,
  fees: { type: 'array', maxItems: 32, items: feeDocumentation },
});
export const priceVersionDocumentation = object({
  ...priceInputDocumentation.properties,
  id: identifier,
  branchId: identifier,
  roomTypeId: identifier,
  createdAt: { type: 'string', format: 'date-time' },
});
export const priceHistoryDocumentation = object({
  branchId: identifier,
  roomTypeId: identifier,
  data: { type: 'array', maxItems: 100, items: priceVersionDocumentation },
  nextCursor: nullable({ type: 'string', format: 'date' }),
});
