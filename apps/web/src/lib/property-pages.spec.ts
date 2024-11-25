import { expect, it, vi } from 'vitest';
import { collectPropertyPages } from './property-pages';
it('BRN-001: counts every real page and retains the most restrictive edit permission', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({ data: [{ id: 'a' }], nextCursor: 'a', canEdit: true })
    .mockResolvedValueOnce({ data: [{ id: 'b' }], nextCursor: null, canEdit: false });
  await expect(collectPropertyPages(read)).resolves.toEqual({
    data: [{ id: 'a' }, { id: 'b' }],
    nextCursor: null,
    canEdit: false,
  });
  expect(read.mock.calls).toEqual([[], ['a']]);
});
it('BRN-001: rejects repeated records or continuation rather than looping or inflating counts', async () => {
  await expect(
    collectPropertyPages(async () => ({ data: [{ id: 'a' }], nextCursor: 'a', canEdit: true })),
  ).rejects.toThrow();
  const read = vi
    .fn()
    .mockResolvedValueOnce({ data: [{ id: 'a' }], nextCursor: 'a', canEdit: true })
    .mockResolvedValue({ data: [], nextCursor: 'a', canEdit: true });
  await expect(collectPropertyPages(read)).rejects.toThrow('Property continuation');
  expect(read).toHaveBeenCalledTimes(2);
});
