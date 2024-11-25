import type { ListingRuleRow } from '../../src/inventory/listing-rules-state.js';
export const ruleIds = {
  first: '019a1234-1234-7123-8123-123456789abc',
  second: '019a1234-1234-7123-8123-123456789abd',
  third: '019a1234-1234-7123-8123-123456789abe',
  branch: '019a1234-1234-7123-8123-123456789abf',
};
export const ruleNow = new Date('2026-10-17T00:00:00Z');
export function ruleRow(input: Partial<ListingRuleRow> = {}): ListingRuleRow {
  return {
    id: ruleIds.first,
    branchId: ruleIds.branch,
    body: 'Keep shared areas tidy.',
    sortOrder: 0,
    revision: 1,
    archivedAt: null,
    createdAt: ruleNow,
    updatedAt: ruleNow,
    ...input,
  };
}
