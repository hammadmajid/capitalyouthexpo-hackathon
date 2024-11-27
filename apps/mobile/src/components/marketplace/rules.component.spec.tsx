/// <reference types="jest" />
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import { listPublicListingRules } from '@hsm/api-client';
import { PublicListingRules } from './rules';
import { pullToRefresh } from '../../test-utils/pull-refresh';
jest.mock('../../lib/runtime', () => ({ client: {}, config: { apiUrl: 'https://example.test' } }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  listPublicListingRules: jest.fn(),
}));
const branchId = '019a1234-1234-7123-8123-123456789abc',
  ruleId = '019a1234-1234-7123-8123-123456789abd';
const row = { id: ruleId, body: 'Quiet shared spaces.', sortOrder: 0 };
let cache: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  jest.resetAllMocks();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => cache.clear());
test('TRUST-006: actual native text and continuation remain live accessible content', async () => {
  jest
    .mocked(listPublicListingRules)
    .mockResolvedValueOnce({ branchId, data: [row], nextCursor: '0:' + ruleId })
    .mockResolvedValueOnce({
      branchId,
      data: [{ ...row, id: branchId, body: '<b>Plain text only</b>', sortOrder: 1 }],
      nextCursor: null,
    });
  await render(<PublicListingRules branchId={branchId} />, { wrapper });
  await screen.findByText(row.body);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Load more hostel rules' }));
  expect(await screen.findByText('<b>Plain text only</b>')).toBeOnTheScreen();
  expect(listPublicListingRules).toHaveBeenLastCalledWith({}, branchId, {
    limit: 20,
    cursor: '0:' + ruleId,
  });
  expect(screen.queryByRole('button', { name: 'Load more hostel rules' })).toBeNull();
});
test('ACC-002: genuine empty native rules never invent content', async () => {
  jest.mocked(listPublicListingRules).mockResolvedValue({ branchId, data: [], nextCursor: null });
  await render(<PublicListingRules branchId={branchId} />, { wrapper });
  await screen.findByText('No published hostel rules are available.');
  expect(screen.queryByRole('button', { name: 'Load more hostel rules' })).toBeNull();
});
test('ACC-002: failed initial read is retryable without claiming an empty success', async () => {
  jest
    .mocked(listPublicListingRules)
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce({ branchId, data: [], nextCursor: null });
  await render(<PublicListingRules branchId={branchId} />, { wrapper });
  await screen.findByRole('alert');
  expect(screen.queryByText('No published hostel rules are available.')).toBeNull();
  await pullToRefresh(cache);
  await screen.findByText('No published hostel rules are available.');
});
test('ACC-002: failed refresh hides cached native rules instead of presenting withdrawn content', async () => {
  jest
    .mocked(listPublicListingRules)
    .mockResolvedValueOnce({ branchId, data: [row], nextCursor: null })
    .mockRejectedValueOnce(new Error('Withdrawn'));
  await render(<PublicListingRules branchId={branchId} />, { wrapper });
  await screen.findByText(row.body);
  await pullToRefresh(cache);
  await screen.findByRole('alert');
  expect(screen.queryByText(row.body)).toBeNull();
  expect(screen.queryByText('No published hostel rules are available.')).toBeNull();
});
