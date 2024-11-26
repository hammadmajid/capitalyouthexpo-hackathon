/// <reference types="jest" />
import { render, screen, userEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OwnerChoice } from './owner-choice';
import { pullToRefresh } from '../test-utils/pull-refresh';
const id = '550e8400-e29b-41d4-a716-446655440000';
test('ONB-001: native named choices paginate without raw identifier entry', async () => {
  const choose = jest.fn(),
    load = jest.fn(async (cursor?: string) => ({
      data: [{ id, name: cursor ? 'Rawalpindi' : 'Islamabad' }],
      nextCursor: cursor ? null : id,
    }));
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <OwnerChoice label="Cities" queryKey={['cities', 'owner']} load={load} choose={choose} />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: 'Islamabad' }));
  expect(choose).toHaveBeenCalledWith({ id, name: 'Islamabad' });
  expect(screen.queryByText(id)).toBeNull();
  await user.press(screen.getByRole('button', { name: 'More Cities' }));
  await screen.findByRole('button', { name: 'Rawalpindi' });
  expect(load).toHaveBeenLastCalledWith(id);
  await user.press(screen.getByRole('button', { name: 'Previous Cities' }));
  await screen.findByRole('button', { name: 'Islamabad' });
});
test('SEC: native lookup failure offers an explicit safe retry without fabricated choices', async () => {
  const load = jest
    .fn()
    .mockRejectedValueOnce(new Error('private detail'))
    .mockResolvedValue({ data: [], nextCursor: null });
  const cache = new QueryClient();
  await render(
    <QueryClientProvider client={cache}>
      <OwnerChoice label="Cities" queryKey={['cities', 'owner']} load={load} choose={jest.fn()} />
    </QueryClientProvider>,
  );
  await screen.findByText('Unable to load choices.');
  expect(screen.queryByText('private detail')).toBeNull();
  await pullToRefresh(cache);
  await screen.findByText('No choices available.');
  expect(load).toHaveBeenCalledTimes(2);
});
