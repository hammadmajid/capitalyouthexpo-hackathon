import { beforeEach, expect, it, vi } from 'vitest';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { ruleIds as ids } from '../../test/unit/listing-rules.fixture.js';
import { readPublicListingRulesRows } from './listing-rules-query.js';
import { PublicListingRulesRepository } from './listing-rules.repository.js';
vi.mock('./listing-rules-query.js', () => ({ readPublicListingRulesRows: vi.fn() }));
const row = { branchId: ids.branch, id: ids.first, body: 'Quiet shared spaces.', sortOrder: 0 };
beforeEach(() => {
  vi.resetAllMocks();
});
function fixture() {
  const store = queryFixture();
  return { store, repository: new PublicListingRulesRepository(store.database) };
}
it('ACC-002: invisible or withdrawn parent remains unavailable, never an apparently empty rules list', async () => {
  vi.mocked(readPublicListingRulesRows).mockResolvedValue([]);
  await expect(fixture().repository.read(ids.branch, { limit: 20 })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
it('ACC-002: only a genuine visible parent with no active rules returns an empty page', async () => {
  vi.mocked(readPublicListingRulesRows).mockResolvedValue([
    { branchId: ids.branch, id: null, body: null, sortOrder: null },
  ]);
  const value = fixture();
  expect(await value.repository.read(ids.branch, { limit: 20 })).toEqual({
    branchId: ids.branch,
    data: [],
    nextCursor: null,
  });
  expect(readPublicListingRulesRows).toHaveBeenCalledWith(value.store.transaction, ids.branch, {
    limit: 20,
  });
});
it('ACC-002: paging retains actual rule text, exact continuation and public-only projection', async () => {
  vi.mocked(readPublicListingRulesRows).mockResolvedValue([row, { ...row, id: ids.second }]);
  expect(await fixture().repository.read(ids.branch, { limit: 1 })).toEqual({
    branchId: ids.branch,
    data: [{ id: ids.first, body: row.body, sortOrder: 0 }],
    nextCursor: '0:' + ids.first,
  });
  vi.mocked(readPublicListingRulesRows).mockResolvedValue([{ ...row, id: ids.second }]);
  expect(
    (await fixture().repository.read(ids.branch, { limit: 1, cursor: '0:' + ids.first }))
      .nextCursor,
  ).toBeNull();
});
it('ACC-002: driver errors propagate and cannot become invented empty listing rules', async () => {
  const failure = new Error('database unavailable');
  vi.mocked(readPublicListingRulesRows).mockRejectedValue(failure);
  await expect(fixture().repository.read(ids.branch, { limit: 20 })).rejects.toBe(failure);
});
it('ACC-002 / SEC-003: invalid parent, child, order, duplicate and overscan rows all fail closed', async () => {
  for (const rows of [
    [{ ...row, branchId: ids.third }],
    [{ ...row, id: null }],
    [{ ...row, body: null }],
    [{ ...row, sortOrder: null }],
    [{ ...row, body: '' }],
    [row, row],
    [{ ...row, id: ids.second }, row],
    [row, { ...row, id: ids.second }, { ...row, id: ids.second }],
    [row, { ...row, id: ids.second }, { ...row, id: ids.third }, { ...row, id: ids.branch }],
  ]) {
    vi.mocked(readPublicListingRulesRows).mockResolvedValue(rows);
    await expect(fixture().repository.read(ids.branch, { limit: 2 })).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  }
});
