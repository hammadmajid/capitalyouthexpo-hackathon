import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { areaPageInputSchema, cityPageSchema, areaPageSchema } from './geography.js';
const id = randomUUID();
it('ONB-001: geography choices use strict names and bounded pagination', () => {
  expect(areaPageInputSchema.parse({})).toEqual({ limit: 20 });
  expect(areaPageInputSchema.parse({ limit: '100', parentId: id, cursor: id })).toEqual({
    limit: 100,
    parentId: id,
    cursor: id,
  });
  expect(
    cityPageSchema.parse({ data: [{ id, name: 'Islamabad' }], nextCursor: null }).data,
  ).toHaveLength(1);
  expect(
    areaPageSchema.parse({
      data: [{ id, name: 'Sector', cityId: id, parentId: null, level: 'sector' }],
      nextCursor: id,
    }).nextCursor,
  ).toBe(id);
});
it.each([{ limit: 0 }, { limit: 101 }, { parentId: 'bad' }, { cursor: 'bad' }, { userId: id }])(
  'SEC-001: invalid or injected geography query rejects %#',
  (input) => {
    expect(areaPageInputSchema.safeParse(input).success).toBe(false);
  },
);
it('SEC-003: geography response cannot carry private or unbounded data', () => {
  expect(
    cityPageSchema.safeParse({ data: [{ id, name: 'City', occupants: [] }], nextCursor: null })
      .success,
  ).toBe(false);
  expect(
    areaPageSchema.safeParse({
      data: [{ id, name: 'Area', cityId: id, parentId: null, level: 'invalid' }],
      nextCursor: null,
    }).success,
  ).toBe(false);
  expect(
    cityPageSchema.safeParse({
      data: Array.from({ length: 101 }, () => ({ id, name: 'City' })),
      nextCursor: null,
    }).success,
  ).toBe(false);
});
