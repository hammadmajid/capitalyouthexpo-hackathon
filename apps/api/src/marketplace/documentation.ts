import type { SchemaObject } from '@nestjs/swagger';
import { object, identifier, money, nullable } from '../inventory/documentation.js';
const count: SchemaObject = { type: 'integer', minimum: 0 };
const text: SchemaObject = { type: 'string' };
const coordinate: SchemaObject = { type: 'number' };
const media = object({ id: identifier, altText: text });
export const summaryDocumentation = object({
  branchId: identifier,
  brandName: text,
  name: text,
  slug: text,
  category: { type: 'string', enum: ['boys', 'girls', 'working_male', 'working_female'] },
  city: text,
  area: nullable(text),
  latitude: coordinate,
  longitude: coordinate,
  priceFromPaisa: nullable(money),
  verified: { type: 'boolean', enum: [true] },
  availableBeds: nullable(count),
  availableWholeRooms: nullable(count),
  distanceMeters: nullable(coordinate),
  amenities: { type: 'array', items: object({ code: text, name: text }) },
  media: { type: 'array', maxItems: 1, items: media },
});
export const pageDocumentation = object({
  data: { type: 'array', items: summaryDocumentation },
  nextCursor: nullable(identifier),
});
export const searchPageDocumentation = object({
  data: { type: 'array', items: summaryDocumentation },
  nextCursor: nullable({ type: 'string', maxLength: 160 }),
});
export const overviewDocumentation = object({
  ...summaryDocumentation.properties,
  description: nullable(text),
  address: text,
  landmark: nullable(text),
  publicPhone: nullable(text),
  publicEmail: nullable(text),
});
export const institutionsDocumentation = object({
  data: {
    type: 'array',
    items: object({
      id: identifier,
      type: {
        type: 'string',
        enum: [
          'university',
          'office',
          'business_hub',
          'school',
          'health',
          'hotel',
          'food',
          'government',
          'library',
          'locality',
        ],
      },
      name: text,
      shortName: nullable(text),
      cityId: identifier,
      latitude: coordinate,
      longitude: coordinate,
      hostelCount: count,
    }),
  },
  nextCursor: nullable(identifier),
});
