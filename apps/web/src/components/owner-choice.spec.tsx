import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OwnerChoice } from './owner-choice';
afterEach(cleanup);
const id = '550e8400-e29b-41d4-a716-446655440000';
function mount(
  load: (
    cursor?: string,
  ) => Promise<{ data: { id: string; name: string }[]; nextCursor: string | null }>,
) {
  const cache = new QueryClient(),
    choose = vi.fn();
  render(
    <QueryClientProvider client={cache}>
      <OwnerChoice label="Cities" queryKey={['cities', 'actor']} load={load} choose={choose} />
    </QueryClientProvider>,
  );
  return { choose, cache, user: userEvent.setup() };
}
it('ONB-001 SEC: paginated names never expose raw IDs, and previous/more navigation preserves query scope', async () => {
  const load = vi.fn(async (cursor?: string) => ({
    data: [{ id, name: cursor ? 'Rawalpindi' : 'Islamabad' }],
    nextCursor: cursor ? null : id,
  }));
  const q = mount(load);
  await q.user.click(await screen.findByRole('button', { name: 'Islamabad' }));
  expect(q.choose).toHaveBeenCalledExactlyOnceWith({ id, name: 'Islamabad' });
  expect(screen.queryByText(id)).toBeNull();
  await q.user.click(screen.getByRole('button', { name: 'More Cities' }));
  expect(await screen.findByRole('button', { name: 'Rawalpindi' })).toBeDefined();
  expect(load).toHaveBeenLastCalledWith(id);
  await q.user.click(screen.getByRole('button', { name: 'Previous Cities' }));
  expect(await screen.findByRole('button', { name: 'Islamabad' })).toBeDefined();
  expect(
    q.cache
      .getQueryCache()
      .getAll()
      .every((query) => query.queryKey[1] === 'actor'),
  ).toBe(true);
});
it('ONB-001: a failed lookup offers safe explicit retry and no fabricated choices', async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error('private database detail'))
    .mockResolvedValue({ data: [], nextCursor: null });
  const q = mount(load);
  expect((await screen.findByRole('alert')).textContent).toBe('Unable to load choices.');
  expect(screen.queryByText('private database detail')).toBeNull();
  await q.user.click(screen.getByRole('button', { name: 'Retry Cities' }));
  await waitFor(() => expect(screen.getByText('No choices available.')).toBeDefined());
  expect(load).toHaveBeenCalledTimes(2);
  expect(q.choose).not.toHaveBeenCalled();
});
