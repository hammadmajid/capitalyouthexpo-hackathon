import { expect, it } from 'vitest';
import { billingCatalogEntrySchema } from '@hsm/contracts';
import { catalogEntry, catalogRow, catalogNow } from '../../test/unit/billing-catalog.fixture.js';
import { projectCatalog, catalogResult } from './catalog.projection.js';
it('FIN-004: catalogue response exposes exact safe integer-paisa facts without creator identity', () => {
  expect(projectCatalog(catalogRow())).toEqual(catalogEntry);
  expect(projectCatalog(catalogRow({ archivedAt: catalogNow })).archivedAt).toBe(
    catalogNow.toISOString(),
  );
  expect(
    projectCatalog(catalogRow({ unitAmountPaisa: BigInt(Number.MAX_SAFE_INTEGER) }))
      .unitAmountPaisa,
  ).toBe(Number.MAX_SAFE_INTEGER);
  expect(projectCatalog(catalogRow())).not.toHaveProperty('createdByUserId');
});
it.each([
  { unitAmountPaisa: -1n },
  { unitAmountPaisa: 0n },
  { unitAmountPaisa: BigInt(Number.MAX_SAFE_INTEGER) + 1n },
  { name: '' },
  { createdAt: new Date(NaN) },
  { archivedAt: new Date('2028-01-31T06:00:00.000Z') },
])(
  'FIN-004: invalid authoritative catalogue fact case %# is internal failure, not invented pricing',
  (patch) => {
    expect(() => projectCatalog(catalogRow(patch))).toThrowError(
      expect.objectContaining({ code: 'INTERNAL' }),
    );
  },
);
it('SEC-003: unexpected private fields in a catalogue response are rejected', () => {
  expect(() =>
    catalogResult(billingCatalogEntrySchema, { ...catalogEntry, privateDocuments: ['secret'] }),
  ).toThrowError(expect.objectContaining({ code: 'INTERNAL' }));
});
