import { expect, it } from 'vitest';
import {
  adminAnnouncementPageSchema,
  adminAnnouncementQuerySchema,
  adminInstitutionQuerySchema,
} from './admin-phase4.js';
it('ADM-010 GEO-003: bounded readers reject malformed filters and identities', () => {
  expect(adminAnnouncementQuerySchema.parse({})).toEqual({ limit: 20 });
  expect(adminInstitutionQuerySchema.parse({ q: ' Institute ' })).toMatchObject({
    q: 'Institute',
    active: 'all',
  });
  for (const input of [{ limit: 51 }, { cursor: 'bad' }, { status: 'delivered' }])
    expect(() => adminAnnouncementQuerySchema.parse(input)).toThrow();
  expect(() => adminInstitutionQuerySchema.parse({ q: '' })).toThrow();
  expect(() =>
    adminAnnouncementPageSchema.parse({ data: [], nextCursor: null, fabricatedDeliveryCount: 5 }),
  ).toThrow();
});
