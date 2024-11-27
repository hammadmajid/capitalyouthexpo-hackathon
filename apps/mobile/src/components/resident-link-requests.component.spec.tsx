/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  decideResidentAccountLink,
  readResidentAccountLinks,
  readOwnResidentLinkStatus,
} from '@hsm/api-client';
import { ResidentLinkRequests } from './resident-link-requests';
import { OwnResidentLinkStatus } from './own-resident-link-status';
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readResidentAccountLinks: jest.fn(),
  decideResidentAccountLink: jest.fn(),
  readOwnResidentLinkStatus: jest.fn(),
}));
const request = {
  id: 'request',
  residentId: 'resident',
  residentName: 'Ali',
  customerName: 'Ali Raza',
  phone: '+923001234567',
  createdAt: '2026-11-18T00:00:00Z',
};
const caches: QueryClient[] = [];
function testCache() {
  const cache = new QueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
  caches.push(cache);
  return cache;
}
beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  for (const cache of caches.splice(0)) cache.clear();
});
it('RES-001 / ACC-004: staff confirms the exact request, then reloads the queue', async () => {
  jest
    .mocked(readResidentAccountLinks)
    .mockResolvedValueOnce({ data: [request], nextCursor: null })
    .mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(decideResidentAccountLink).mockResolvedValue({ success: true });
  await render(
    <QueryClientProvider client={testCache()}>
      <ResidentLinkRequests actorId="owner" branchId="branch" />
    </QueryClientProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Approve account' }));
  await waitFor(() =>
    expect(decideResidentAccountLink).toHaveBeenCalledWith({}, 'branch', 'request', {
      action: 'approve',
    }),
  );
  await waitFor(() => expect(screen.queryByText('Account requests')).toBeNull());
});
it('RES-001: a customer sees pending confirmation without private resident information', async () => {
  jest.mocked(readOwnResidentLinkStatus).mockResolvedValue({ pending: true });
  await render(
    <QueryClientProvider client={testCache()}>
      <OwnResidentLinkStatus actorId="customer" />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText(
      'Your hostel is confirming your account. Your stay will appear after approval.',
    ),
  ).toBeVisible();
  expect(screen.queryByText('Ali')).toBeNull();
});
