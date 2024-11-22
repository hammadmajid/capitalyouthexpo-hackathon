import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { bedOccupancyStateSchema, occupancyRentStatusSchema } from '@hsm/contracts';
import { identifier, object, nullable } from '../inventory/documentation.js';
const status = { type: 'string' as const, enum: ['active', 'inactive', 'maintenance'] },
  count = { type: 'integer' as const, minimum: 0 };
const bedDocumentation = object({
  id: identifier,
  label: { type: 'string' },
  ordinal: { type: 'integer', minimum: 1 },
  status,
  state: { type: 'string', enum: bedOccupancyStateSchema.options },
  rentStatus: nullable({ type: 'string', enum: occupancyRentStatusSchema.options }),
  occupant: nullable(object({ stayId: identifier, displayName: { type: 'string' } })),
});
const claimDocumentation = object({
  source: { type: 'string', enum: ['assignment', 'block', 'booking', 'hold'] },
  bookingId: nullable(identifier),
  stayId: nullable(identifier),
  moveInDate: { type: 'string', format: 'date' },
  moveOutDate: nullable({ type: 'string', format: 'date' }),
  wholeRoom: { type: 'boolean' },
});
export const bedOccupancyDocumentation = object(
  {
    branchId: identifier,
    on: { type: 'string', format: 'date' },
    room: object({
      id: identifier,
      label: { type: 'string' },
      roomTypeId: identifier,
      roomTypeName: { type: 'string' },
      status,
    }),
    bed: bedDocumentation,
    location: object({
      hostel: object({ id: identifier, name: { type: 'string' } }),
      branch: object({ id: identifier, name: { type: 'string' } }),
      building: nullable(object({ id: identifier, name: { type: 'string' } })),
      floor: nullable(
        object({ id: identifier, label: { type: 'string' }, levelNumber: { type: 'integer' } }),
      ),
    }),
    claims: { type: 'array', maxItems: 50, items: claimDocumentation },
    upcoming: { type: 'array', maxItems: 20, items: claimDocumentation },
  },
  ['location', 'upcoming'],
);
export const occupancyPageDocumentation = object({
  branchId: identifier,
  on: { type: 'string', format: 'date' },
  totals: object({
    beds: count,
    occupied: count,
    blocked: count,
    reserved: count,
    unavailable: count,
    available: count,
  }),
  data: {
    type: 'array',
    maxItems: 50,
    items: object({
      id: identifier,
      label: { type: 'string' },
      roomTypeId: identifier,
      status,
      building: nullable(object({ id: identifier, name: { type: 'string' } })),
      floor: nullable(
        object({ id: identifier, label: { type: 'string' }, levelNumber: { type: 'integer' } }),
      ),
      beds: {
        type: 'array',
        items: object({
          id: identifier,
          label: { type: 'string' },
          ordinal: { type: 'integer', minimum: 1 },
          status,
          state: { type: 'string', enum: bedOccupancyStateSchema.options },
          rentStatus: nullable({ type: 'string', enum: occupancyRentStatusSchema.options }),
          occupant: nullable(object({ stayId: identifier, displayName: { type: 'string' } })),
        }),
      },
    }),
  },
  nextCursor: nullable(identifier),
});
export function OccupancyQueries() {
  return applyDecorators(
    ApiQuery({ name: 'on', required: false, schema: { type: 'string', format: 'date' } }),
    ApiQuery({ name: 'cursor', required: false, schema: identifier }),
    ApiQuery({ name: 'roomTypeId', required: false, schema: identifier }),
    ApiQuery({ name: 'roomId', required: false, schema: identifier }),
    ApiQuery({
      name: 'state',
      required: false,
      schema: { type: 'string', enum: bedOccupancyStateSchema.options },
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    }),
  );
}
