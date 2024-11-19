import { expect, it } from 'vitest';
import {
  decodeListingRuleCursor,
  encodeListingRuleCursor,
  listingRuleArchiveSchema,
  listingRuleCursorSchema,
  listingRuleInputSchema,
  listingRulesQuerySchema,
  privateListingRuleSchema,
  privateListingRuleStateSchema,
  privateListingRulesPageSchema,
  publicListingRuleSchema,
  publicListingRulesPageSchema,
  publicListingRulesQuerySchema,
} from './listing-rules.js';
const first = '019a1234-1234-7123-8123-123456789abc',
  second = '019a1234-1234-7123-8123-123456789abd',
  branchId = '019a1234-1234-7123-8123-123456789abe';
const rule = { id: first, body: 'Keep shared areas tidy.', sortOrder: 0 };
const row = {
  ...rule,
  branchId,
  version: 'a'.repeat(64),
  createdAt: '2026-10-17T00:00:00Z',
  updatedAt: '2026-10-17T00:00:00Z',
  archivedAt: null,
};
const page = { branchId, data: [rule], nextCursor: null };
const privatePage = { ...page, state: 'active' as const, canEdit: true, data: [row] };
it('TRUST-006: rule input is bounded explicit plain text and has no policy/identity override fields', () => {
  expect(listingRuleInputSchema.parse({ body: '  Quiet shared spaces.  ', sortOrder: 4 })).toEqual({
    body: 'Quiet shared spaces.',
    sortOrder: 4,
  });
  for (const input of [
    { body: '', sortOrder: 0 },
    { body: '  ', sortOrder: 0 },
    { body: 'a'.repeat(4001), sortOrder: 0 },
    { body: 'Rule', sortOrder: -1 },
    { body: 'Rule', sortOrder: 0.5 },
    { body: 'Rule', sortOrder: 2147483648 },
    { body: 'Rule' },
    { body: 'Rule', sortOrder: 0, branchId },
    { body: 'Rule', sortOrder: 0, revision: 1 },
    { body: 'Rule', sortOrder: 0, requiredDocuments: ['cnic'] },
  ])
    expect(listingRuleInputSchema.safeParse(input).success).toBe(false);
});
it('AUD-001: archival requires a bounded reason and accepts no deletion/status command', () => {
  expect(listingRuleArchiveSchema.parse({ reason: ' Superseded ' })).toEqual({
    reason: 'Superseded',
  });
  for (const value of [
    { reason: '' },
    { reason: 'x'.repeat(501) },
    { reason: 'Removed', delete: true },
  ])
    expect(listingRuleArchiveSchema.safeParse(value).success).toBe(false);
});
it('ACC-002: ordered continuation binds exact integer position and canonical UUID', () => {
  expect(encodeListingRuleCursor(2147483647, first.toUpperCase())).toBe('2147483647:' + first);
  expect(decodeListingRuleCursor('0:' + first.toUpperCase())).toEqual({ id: first, sortOrder: 0 });
  expect(encodeListingRuleCursor(0, first)).toBe('0:' + first);
});
it.each(['01:', '-1:', '1.5:', '2147483648:', 'NaN:'])(
  'ACC-002: invalid position %s cannot become continuation',
  (prefix) => {
    expect(listingRuleCursorSchema.safeParse(prefix + first).success).toBe(false);
  },
);
it('ACC-002: malformed continuation cannot identify or decode a rule', () => {
  expect(listingRuleCursorSchema.safeParse('0:not-a-uuid').success).toBe(false);
  expect(() => decodeListingRuleCursor('bad')).toThrow();
  expect(() => encodeListingRuleCursor(-1, first)).toThrow();
});
it('ACC-002: query paging is strict and public callers cannot request archive history', () => {
  expect(listingRulesQuerySchema.parse({})).toEqual({ state: 'active', limit: 20 });
  expect(listingRulesQuerySchema.parse({ state: 'archived', limit: '100' }).limit).toBe(100);
  expect(publicListingRulesQuerySchema.parse({})).toEqual({ limit: 20 });
  for (const value of [
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { cursor: 'bad' },
    { state: 'all' },
    { unknown: 1 },
  ])
    expect(listingRulesQuerySchema.safeParse(value).success).toBe(false);
  expect(publicListingRulesQuerySchema.safeParse({ state: 'archived' }).success).toBe(false);
});
it('ACC-002: public rules distinguish a genuine empty page and validate an exact next position', () => {
  expect(publicListingRulesPageSchema.parse({ branchId, data: [], nextCursor: null }).data).toEqual(
    [],
  );
  expect(publicListingRulesPageSchema.parse({ ...page, nextCursor: '0:' + first })).toEqual({
    ...page,
    nextCursor: '0:' + first,
  });
  expect(
    publicListingRulesPageSchema.parse({
      ...page,
      data: [rule, { ...rule, id: second, sortOrder: 1 }],
    }).data,
  ).toHaveLength(2);
  expect(
    publicListingRulesPageSchema.parse({ ...page, data: [rule, { ...rule, id: second }] }).data,
  ).toHaveLength(2);
});
it('ACC-002: duplicate, disordered, oversized and mismatched public pages fail instead of silently truncating', () => {
  for (const value of [
    { ...page, data: [rule, rule] },
    { ...page, data: [{ ...rule, id: second }, rule] },
    {
      ...page,
      data: [
        { ...rule, sortOrder: 1 },
        { ...rule, id: second },
      ],
    },
    { ...page, data: Array.from({ length: 101 }, () => rule) },
    { ...page, nextCursor: '1:' + first },
    { ...page, nextCursor: '0:' + second },
    { ...page, data: [], nextCursor: '0:' + first },
  ])
    expect(publicListingRulesPageSchema.safeParse(value).success).toBe(false);
});
it('ACC-002 / SEC-003: public rules expose no private actor, revision, audit, identity or archival fields', () => {
  for (const key of [
    'branchId',
    'version',
    'revision',
    'actorUserId',
    'cnic',
    'archivedAt',
    'canEdit',
  ])
    expect(publicListingRuleSchema.safeParse({ ...rule, [key]: 'private' }).success).toBe(false);
});
it('ACC-004: private pages bind exact branch, current edit authority and archive state', () => {
  expect(privateListingRulesPageSchema.parse(privatePage).canEdit).toBe(true);
  expect(
    privateListingRulesPageSchema.parse({
      ...privatePage,
      state: 'archived',
      canEdit: false,
      data: [{ ...row, archivedAt: row.updatedAt }],
    }).canEdit,
  ).toBe(false);
  expect(
    privateListingRulesPageSchema.safeParse({
      ...privatePage,
      data: [{ ...row, branchId: second }],
    }).success,
  ).toBe(false);
  expect(
    privateListingRulesPageSchema.safeParse({ ...privatePage, state: 'archived' }).success,
  ).toBe(false);
  expect(
    privateListingRulesPageSchema.safeParse({
      ...privatePage,
      data: [{ ...row, archivedAt: row.updatedAt }],
    }).success,
  ).toBe(false);
  expect(
    privateListingRulesPageSchema.safeParse({
      branchId,
      state: 'active',
      data: [row],
      nextCursor: null,
    }).success,
  ).toBe(false);
});
it('TRUST-006: private row versions and timestamps are strict; public rule text remains plain data', () => {
  expect(privateListingRuleSchema.parse(row).version).toHaveLength(64);
  expect(privateListingRuleSchema.safeParse({ ...row, version: 'stale' }).success).toBe(false);
  expect(privateListingRuleSchema.safeParse({ ...row, createdAt: 'today' }).success).toBe(false);
  expect(
    publicListingRuleSchema.parse({ ...rule, body: '<script>not executable</script>' }).body,
  ).toContain('<script>');
});

it('ACC-004: an exact private rule read carries actual current edit authority', () => {
  expect(privateListingRuleStateSchema.parse({ ...row, canEdit: false }).canEdit).toBe(false);
  expect(privateListingRuleStateSchema.parse({ ...row, canEdit: true }).canEdit).toBe(true);
  expect(privateListingRuleStateSchema.safeParse(row).success).toBe(false);
});
