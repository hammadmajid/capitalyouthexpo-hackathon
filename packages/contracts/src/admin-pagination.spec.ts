import { expect, it } from 'vitest';
import { adminAccountListSchema, adminListQuerySchema } from './platform-admin.js';
it('ADM-001: bounded cursor input rejects malformed, excessive and unknown fields', () => {
  expect(adminListQuerySchema.parse({})).toEqual({ limit: 50 });
  for (const input of [{ cursor: 'invalid' }, { limit: 0 }, { limit: 101 }, { isRoot: true }])
    expect(adminListQuerySchema.safeParse(input).success).toBe(false);
});
it('ADM-001: legacy list parsing remains compatible, new pages carry cursor and actual summaries', () => {
  expect(adminAccountListSchema.parse({ data: [] })).toMatchObject({ data: [], nextCursor: null });
  expect(
    adminAccountListSchema.parse({ data: [], nextCursor: null, activeRootCount: 1, totalCount: 0 }),
  ).toMatchObject({ activeRootCount: 1, totalCount: 0 });
});
