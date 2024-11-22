import { expect, it } from 'vitest';
import {
  inventoryPageRows,
  projectInventoryType,
  projectInventoryRoom,
  projectInventorySeat,
} from './page-projection.js';
import {
  pageIds as ids,
  pageType,
  pageRoom,
  pageSeat,
} from '../../test/unit/inventory-pages.fixture.js';
it('ROOM-002: complete and empty pages have no continuation', () => {
  expect(inventoryPageRows([], { limit: 1 })).toEqual({ data: [], nextCursor: null });
  expect(inventoryPageRows([{ id: ids.first }], { limit: 1 })).toEqual({
    data: [{ id: ids.first }],
    nextCursor: null,
  });
});
it('BKG-004: effective fee snapshots replace legacy fees as one version, including an explicit empty list', () => {
  const row = { ...pageType(), priceVersionId: ids.second, priceFees: [] };
  expect(projectInventoryType(row, [])).toMatchObject({ fees: [] });
  expect(() => projectInventoryType({ ...row, priceFees: null }, [])).toThrowError(
    expect.objectContaining({ code: 'INTERNAL' }),
  );
});
it('ROOM-002: unsafe persisted paisa cannot silently round at the page boundary', () => {
  expect(() =>
    projectInventoryType(pageType({ bedMonthlyRentPaisa: 9007199254740992n }), []),
  ).toThrowError(expect.objectContaining({ code: 'INTERNAL' }));
});
it('ROOM-002: invalid persisted time, status, bed ordinal and mode prices become typed metadata failure', () => {
  expect(() => projectInventoryRoom(pageRoom({ archivedAt: new Date('bad') }))).toThrowError(
    expect.objectContaining({ code: 'INTERNAL' }),
  );
  expect(() => projectInventoryRoom(pageRoom({ id: 'bad' }))).toThrowError(
    expect.objectContaining({ code: 'INTERNAL' }),
  );
  expect(() => projectInventorySeat(pageSeat({ ordinal: 0 }))).toThrowError(
    expect.objectContaining({ code: 'INTERNAL' }),
  );
  expect(() => projectInventoryType(pageType({ bedMonthlyRentPaisa: null }), [])).toThrowError(
    expect.objectContaining({ code: 'INTERNAL' }),
  );
});
