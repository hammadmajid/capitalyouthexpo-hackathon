import { expect, it } from 'vitest';
import {
  invoiceReferencePageMatches as matches,
  stayInvoiceReferencePageSchema as pageSchema,
  stayInvoiceReferenceQuerySchema as querySchema,
} from './finance-invoice-references.js';
const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const third = '10000000-0000-4000-8000-000000000003';
const row = {
  invoiceId: second,
  invoiceNumber: 'INV-1',
  dueDate: '2028-03-01',
  issuedAt: '2028-02-01T06:00:00.000Z',
  documentState: 'issued',
};
const value = { branchId: first, stayId: first, data: [row], nextCursor: null };
it('FIN-001: private references include retained document state without inventing financial status', () => {
  const page = pageSchema.parse(value);
  expect(matches(page, first, querySchema.parse({}))).toBe(true);
  expect(matches(page, first, { limit: 1, cursor: first }, first)).toBe(true);
  expect(pageSchema.parse({ ...value, data: [{ ...row, documentState: 'voided' }] })).toMatchObject(
    { data: [{ documentState: 'voided' }] },
  );
  expect(pageSchema.parse({ ...value, data: [] })).toMatchObject({ data: [], nextCursor: null });
});
it.each([
  { ...value, residentName: 'Private name' },
  { ...value, data: [{ ...row, paid: true }] },
  { ...value, data: [{ ...row, documentState: 'paid' }] },
  { ...value, data: [{ ...row, issuedAt: 'invalid' }] },
  { ...value, data: [{ ...row, dueDate: '0000-01-01' }] },
  { ...value, data: [{ ...row, invoiceNumber: '' }] },
  { ...value, data: [row, row] },
  { ...value, data: [{ ...row, invoiceId: third }, row] },
  { ...value, nextCursor: third },
  { ...value, data: [], nextCursor: second },
  { ...value, data: Array.from({ length: 101 }, () => row) },
  { ...value, stayId: 'bad' },
])('SEC-003 / FIN-001: malformed, expanded or inconsistent page rejects %#', (page) => {
  expect(pageSchema.safeParse(page).success).toBe(false);
});
it.each([
  { stay: second, branch: first, query: { limit: 20 } },
  { stay: first, branch: second, query: { limit: 20 } },
  { stay: first, branch: first, query: { limit: 1, cursor: second } },
  { stay: first, branch: first, query: { limit: 1, cursor: third } },
])('SEC-003: page must match exact requested Stay, branch and exclusive cursor %#', (input) => {
  expect(
    matches(pageSchema.parse(value), input.stay, querySchema.parse(input.query), input.branch),
  ).toBe(false);
});
it('FIN-001: page size and nonterminal continuation match the actual requested limit', () => {
  const page = pageSchema.parse({ ...value, nextCursor: second });
  expect(matches(page, first, { limit: 1 })).toBe(true);
  expect(matches(page, first, { limit: 2 })).toBe(false);
  expect(
    matches(pageSchema.parse({ ...value, data: [row, { ...row, invoiceId: third }] }), first, {
      limit: 1,
    }),
  ).toBe(false);
});
it.each([
  { limit: 0 },
  { limit: 101 },
  { limit: 1.5 },
  { cursor: 'bad' },
  { residentId: first },
  { includePrivate: true },
])('SEC-003: query is bounded and rejects authority or identity overrides %#', (query) => {
  expect(querySchema.safeParse(query).success).toBe(false);
});
