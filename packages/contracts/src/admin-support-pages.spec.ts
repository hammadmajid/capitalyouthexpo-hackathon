import { expect, it } from 'vitest';
import {
  supportMessagePageSchema,
  supportMessageQuerySchema,
  supportStaffQuerySchema,
} from './admin-support-pages.js';
const id = '10000000-0000-4000-8000-000000000001';
it('ADM-009: staff search/priority and bounded UUID continuation reject unsupported values', () => {
  expect(
    supportStaffQuerySchema.parse({ priority: 'critical', q: '  support  ', limit: '2' }),
  ).toMatchObject({ q: 'support', limit: 2 });
  expect(supportMessageQuerySchema.parse({})).toEqual({ limit: 50 });
  for (const input of [{ cursor: 'bad' }, { limit: 101 }, { limit: 0 }, { arbitrary: true }])
    expect(() => supportMessageQuerySchema.parse(input)).toThrow();
  for (const input of [{ priority: 'urgent' }, { q: '' }, { q: 'a'.repeat(161) }])
    expect(() => supportStaffQuerySchema.parse(input)).toThrow();
});
it('SEC-003: message transport has exact ticket identity and rejects extra private fields', () => {
  const page = { ticketId: id, data: [], nextCursor: null };
  expect(supportMessagePageSchema.parse(page)).toEqual(page);
  expect(() =>
    supportMessagePageSchema.parse({ ...page, participantEmail: 'private@example.test' }),
  ).toThrow();
});
