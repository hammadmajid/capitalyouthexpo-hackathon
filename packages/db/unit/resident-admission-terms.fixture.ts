import { randomUUID } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import type { PostingTransaction } from '../src/resident-posting-context.js';
import { billingPolicies, residentChargeCatalog } from '../src/schema/index.js';
import { rentTerms, rentIds } from './resident-rent.fixture.js';
export const termsIds = {
  branch: rentIds.branch,
  brand: randomUUID(),
  type: randomUUID(),
  catalog: randomUUID(),
};
export const admissionTerms = {
  ...rentTerms,
  policy: { ...rentTerms.policy, customCharges: 'catalog_only' as const },
};
export const termsInput = {
  branchId: termsIds.branch,
  brandId: termsIds.brand,
  roomTypeId: termsIds.type,
  terms: admissionTerms,
};
export const policyRow = {
  id: rentTerms.policyVersionId,
  brandId: null,
  branchId: termsIds.branch,
  roomTypeId: null,
  isCurrent: true,
  policy: admissionTerms.policy,
};
export const catalogRow = {
  id: termsIds.catalog,
  branchId: termsIds.branch,
  code: 'laundry',
  name: 'Laundry',
  unitLabel: 'Bag',
  unitAmountPaisa: 12301n,
  archivedAt: null,
};
export const catalogSnapshot = {
  catalogId: catalogRow.id,
  code: catalogRow.code,
  name: catalogRow.name,
  unitLabel: catalogRow.unitLabel,
  unitAmountPaisa: 12301,
};
export function termsFixture(options: { policies?: unknown[]; catalog?: unknown[] } = {}) {
  const rows = new Map<unknown, unknown[]>([
    [billingPolicies, options.policies ?? [policyRow]],
    [residentChargeCatalog, options.catalog ?? [catalogRow]],
  ]);
  const predicates: { table: unknown; value: SQL }[] = [],
    locks: { table: unknown; mode: string }[] = [],
    limits: number[] = [];
  function select() {
    let table: unknown;
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      where(value: SQL) {
        predicates.push({ table, value });
        return query;
      },
      limit(value: number) {
        limits.push(value);
        return query;
      },
      for(mode: string) {
        locks.push({ table, mode });
        return query;
      },
      then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(rows.get(table) ?? []).then(resolve, reject);
      },
    };
    return query;
  }
  return { tx: { select } as unknown as PostingTransaction, predicates, locks, limits };
}
