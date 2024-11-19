import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { problemSchema } from './errors.js';
import {
  listingSettingsInputSchema,
  privateListingSchema,
  listingVersionSchema,
  listingPreconditionSchema,
  amenityCatalogQuerySchema,
  amenityCatalogPageSchema,
} from './listing-settings.js';
const fields = {
  description: null,
  nearbyLandmark: null,
  publicPhone: null,
  publicEmail: null,
  showPublicContact: false,
  amenityCodes: [],
};
it('ACC-002 / TRUST-006: listing settings require actual explicit fields and never infer contact publication', () => {
  expect(listingSettingsInputSchema.parse(fields)).toEqual(fields);
  expect(() => listingSettingsInputSchema.parse({ amenityCodes: [] })).toThrow();
});
it('ACC-002: explicitly supplied public text/contact fields normalize without borrowing private identity', () => {
  expect(
    listingSettingsInputSchema.parse({
      ...fields,
      description: ' Description ',
      nearbyLandmark: ' Near university ',
      publicPhone: '+925112345678',
      publicEmail: ' HOSTEL@EXAMPLE.TEST ',
      showPublicContact: true,
      amenityCodes: ['wifi'],
    }),
  ).toMatchObject({
    description: 'Description',
    nearbyLandmark: 'Near university',
    publicPhone: '+925112345678',
    publicEmail: 'hostel@example.test',
    showPublicContact: true,
    amenityCodes: ['wifi'],
  });
});
it.each([
  { category: 'boys' },
  { addressLine: 'New location' },
  { customerCnic: 'private' },
  { ownerUserId: randomUUID() },
  { publicPhone: '03001234567' },
  { publicEmail: 'invalid' },
  { description: '' },
  { amenityCodes: ['wifi', 'wifi'] },
  { amenityCodes: ['WiFi'] },
  { amenityCodes: Array.from({ length: 101 }, (_, index) => 'amenity_' + index) },
])(
  'SEC-003: unapproved fields and invalid listing input fail the shared boundary: %j',
  (change) => {
    expect(() => listingSettingsInputSchema.parse({ ...fields, ...change })).toThrow();
  },
);
it('SEC-003: private listing read DTO carries exact branch/version, active or retired selected codes, and no file keys', () => {
  const { amenityCodes, ...values } = fields;
  void amenityCodes;
  const input = {
    ...values,
    branchId: randomUUID(),
    version: 'a'.repeat(64),
    canEdit: false,
    amenities: [{ code: 'wifi', name: 'Wi-Fi', isActive: false }],
  };
  expect(privateListingSchema.parse(input)).toEqual(input);
  expect(() => privateListingSchema.parse({ ...input, storageKey: 'private' })).toThrow();
});
it('TRUST-006: version and quoted If-Match require a complete opaque revision', () => {
  const version = 'a'.repeat(64);
  expect(listingVersionSchema.parse(version)).toBe(version);
  expect(listingPreconditionSchema.parse('"' + version + '"')).toBe(version);
  expect(() => listingVersionSchema.parse('A'.repeat(64))).toThrow();
  expect(() => listingPreconditionSchema.parse(version)).toThrow();
});
it('ACC-002: approved amenity catalog is bounded with an actual code cursor', () => {
  expect(amenityCatalogQuerySchema.parse({})).toEqual({ limit: 20 });
  expect(amenityCatalogQuerySchema.parse({ cursor: 'wifi', limit: '10' })).toEqual({
    cursor: 'wifi',
    limit: 10,
  });
  expect(amenityCatalogPageSchema.parse({ data: [], nextCursor: null })).toEqual({
    data: [],
    nextCursor: null,
  });
});
it.each([{ limit: 0 }, { limit: 101 }, { cursor: 'UNKNOWN' }, { branchId: randomUUID() }])(
  'SEC-003: catalog cannot accept hidden scope or unbounded pages: %j',
  (query) => {
    expect(() => amenityCatalogQuerySchema.parse(query)).toThrow();
  },
);

it('TRUST-006: documented 412 precondition failures remain typed problem responses', () => {
  expect(
    problemSchema.parse({
      type: 'https://example.test/problem',
      title: 'Listing changed',
      status: 412,
      code: 'PRECONDITION_FAILED',
      detail: 'Refresh current settings',
      traceId: 'fixture',
    }).code,
  ).toBe('PRECONDITION_FAILED');
});
