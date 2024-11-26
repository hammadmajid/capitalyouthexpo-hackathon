/// <reference types="jest" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, act, waitFor } from '@testing-library/react-native';
import { ApiFailure, readApi } from '@hsm/api-client';
import { actorClient, client } from '../lib/runtime';
import { Branches } from './branches';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(), client: { GET: jest.fn() } }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  readApi: jest.fn(),
}));
const mockPolicy = jest.fn(
  (props: { actorId: string; target: { branchId: string }; accessUnavailable?: boolean }) => {
    void props;
    return null;
  },
);
jest.mock('./native-billing-policy', () => ({
  NativeBillingPolicy: (props: {
    actorId: string;
    target: { branchId: string };
    accessUnavailable?: boolean;
  }) => mockPolicy(props),
}));
const mockCatalogue = jest.fn(
  (props: { actorId: string; branchId: string; accessUnavailable?: boolean }) => {
    void props;
    return null;
  },
);
jest.mock('./native-billing-catalog', () => ({
  NativeBillingCatalog: (props: {
    actorId: string;
    branchId: string;
    accessUnavailable?: boolean;
  }) => mockCatalogue(props),
}));
const mockBookings = jest.fn(
  (props: { actorId: string; branchId: string; accessUnavailable?: boolean }) => {
    void props;
    return null;
  },
);
const mockTransport = jest.fn((props: { actorId: string; branchId: string }) => {
  void props;
  return null;
});
jest.mock('./transport/transport-workspace', () => ({
  TransportWorkspace: (props: { actorId: string; branchId: string }) => mockTransport(props),
}));
const mockInventory = jest.fn(
  (props: { actorId: string; branchId: string; accessUnavailable?: boolean }) => {
    void props;
    return null;
  },
);
const mockStays = jest.fn(
  (props: { actorId: string; branchId: string; accessUnavailable?: boolean }) => {
    void props;
    return null;
  },
);
// CHG-048: the Residents tab is the people list (BranchResidents).
jest.mock('./branch-residents', () => ({
  BranchResidents: (props: { actorId: string; branchId: string; accessUnavailable?: boolean }) =>
    mockStays(props),
}));
jest.mock('./native-inventory', () => ({
  NativeInventory: (props: { actorId: string; branchId: string; accessUnavailable?: boolean }) =>
    mockInventory(props),
}));
jest.mock('./hostel-bookings', () => ({
  HostelBookings: (props: { actorId: string; branchId: string; accessUnavailable?: boolean }) =>
    mockBookings(props),
}));
const actorA = '019a1234-1234-7123-8123-123456789abc',
  actorB = '019a1234-1234-7123-8123-123456789abd';
let cache: QueryClient;
beforeEach(() => {
  jest.resetAllMocks();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.mocked(actorClient).mockResolvedValue(client);
  jest
    .mocked(readApi)
    .mockResolvedValue({ data: [{ id: actorA, name: 'Branch A' }], nextCursor: null });
});
afterEach(() => cache.clear());
async function show(actorId = actorA) {
  return render(
    <QueryClientProvider client={cache}>
      <Branches actorId={actorId} context="manager" />
    </QueryClientProvider>,
  );
}
test('CHG-043: Owner Operations opens Transport for the selected branch', async () => {
  await render(
    <QueryClientProvider client={cache}>
      <Branches actorId={actorA} context="owner" initialSection="transport" />
    </QueryClientProvider>,
  );
  await userEvent.setup().press(await screen.findByRole('button', { name: 'Branch A' }));
  expect(screen.getByRole('button', { name: 'Transport' })).toBeTruthy();
  expect(mockTransport).toHaveBeenCalledWith({ actorId: actorA, branchId: actorA });
});
test('ACC-004 / SEC-003: native branch reads use the current verified actor and management endpoint', async () => {
  await show();
  await screen.findByRole('button', { name: 'Branch A' });
  expect(actorClient).toHaveBeenCalledWith(actorA);
  expect(client.GET).toHaveBeenCalledWith('/v1/manage/branches', {
    params: { query: { limit: 50 } },
  });
});
test('SEC-003: a changed native token binding cannot issue a branch lookup', async () => {
  jest.mocked(actorClient).mockRejectedValue(new Error('Account changed'));
  await show();
  await screen.findByRole('button', { name: 'Try again' });
  expect(client.GET).not.toHaveBeenCalled();
  expect(readApi).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Branch A' })).toBeNull();
});
test('ACC-004: only a branch selected from the actual scoped page opens its queue', async () => {
  await show();
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: 'Branch A' }));
  await user.press(screen.getByRole('button', { name: 'Billing policy' }));
  expect(mockPolicy).toHaveBeenLastCalledWith({
    actorId: actorA,
    target: { branchId: actorA },
    accessUnavailable: false,
    standalone: false,
  });
  await user.press(screen.getByRole('button', { name: 'Charges catalog' }));
  expect(mockCatalogue).toHaveBeenLastCalledWith({
    actorId: actorA,
    branchId: actorA,
    accessUnavailable: false,
    standalone: false,
  });
  await user.press(screen.getByRole('button', { name: 'Residents and stays' }));
  expect(mockStays).toHaveBeenLastCalledWith({
    actorId: actorA,
    branchId: actorA,
    accessUnavailable: false,
  });
  await user.press(screen.getByRole('button', { name: 'Bookings' }));
  expect(mockBookings).toHaveBeenLastCalledWith({
    actorId: actorA,
    branchId: actorA,
    accessUnavailable: false,
  });
  await user.press(screen.getByRole('button', { name: 'Rooms, beds and rent' }));
  expect(mockInventory).toHaveBeenLastCalledWith({
    actorId: actorA,
    branchId: actorA,
    accessUnavailable: false,
    embedded: true,
  });
});
test('ACC-004: branch page changes close the previous booking queue', async () => {
  jest
    .mocked(readApi)
    .mockResolvedValueOnce({ data: [{ id: actorA, name: 'Branch A' }], nextCursor: actorB })
    .mockResolvedValueOnce({ data: [{ id: actorB, name: 'Branch B' }], nextCursor: null });
  await show();
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: 'Branch A' }));
  await user.press(screen.getByRole('button', { name: 'Back to branches' }));
  await user.press(screen.getByRole('button', { name: 'Next branches' }));
  await screen.findByRole('button', { name: 'Branch B' });
  expect(screen.queryByText('Selected: Branch A')).toBeNull();
  expect(screen.queryByText('Selected: Branch B')).toBeNull();
  expect(client.GET).toHaveBeenLastCalledWith('/v1/manage/branches', {
    params: { query: { limit: 50, cursor: actorB } },
  });
});
test('SEC-003: account changes discard branch selection and previous private labels', async () => {
  const mounted = await show();
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: 'Branch A' }));
  jest
    .mocked(readApi)
    .mockResolvedValue({ data: [{ id: actorB, name: 'Branch B' }], nextCursor: null });
  await mounted.rerender(
    <QueryClientProvider client={cache}>
      <Branches actorId={actorB} context="manager" />
    </QueryClientProvider>,
  );
  await screen.findByRole('button', { name: 'Branch B' });
  expect(screen.queryByRole('button', { name: 'Branch A' })).toBeNull();
  expect(screen.queryByText('Selected: Branch A')).toBeNull();
  expect(actorClient).toHaveBeenLastCalledWith(actorB);
});
test('SEC-003: definitive branch revocation hides cached selection', async () => {
  await show();
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: 'Branch A' }));
  jest.mocked(readApi).mockRejectedValue(
    new ApiFailure({
      type: 'https://example.test/problem',
      title: 'Denied',
      status: 403,
      code: 'BRANCH_FORBIDDEN',
      detail: 'Unavailable',
      traceId: 'fixture',
    }),
  );
  await act(() => cache.invalidateQueries({ queryKey: ['branches', actorA, 'manager'] }));
  await screen.findByRole('button', { name: 'Try again' });
  expect(screen.queryByRole('button', { name: 'Branch A' })).toBeNull();
  expect(screen.queryByText('Selected: Branch A')).toBeNull();
});
test('ACC-004: branch refresh outages preserve selection while disabling queue actions', async () => {
  await show();
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: 'Branch A' }));
  jest.mocked(readApi).mockRejectedValue(new Error('Offline'));
  await act(() => cache.invalidateQueries({ queryKey: ['branches', actorA, 'manager'] }));
  expect(screen.getByRole('button', { name: 'Back to branches' })).toBeTruthy();
  await waitFor(() =>
    expect(mockBookings).toHaveBeenLastCalledWith({
      actorId: actorA,
      branchId: actorA,
      accessUnavailable: true,
    }),
  );
  await user.press(screen.getByRole('button', { name: 'Billing policy' }));
  expect(mockPolicy).toHaveBeenLastCalledWith({
    actorId: actorA,
    target: { branchId: actorA },
    accessUnavailable: true,
    standalone: false,
  });
  await user.press(screen.getByRole('button', { name: 'Charges catalog' }));
  expect(mockCatalogue).toHaveBeenLastCalledWith({
    actorId: actorA,
    branchId: actorA,
    accessUnavailable: true,
    standalone: false,
  });
  await user.press(screen.getByRole('button', { name: 'Rooms, beds and rent' }));
  expect(mockInventory).toHaveBeenLastCalledWith({
    actorId: actorA,
    branchId: actorA,
    accessUnavailable: true,
    embedded: true,
  });
});

test('UI-001: Owner Operations excludes billing policy even for an old billing tool link', async () => {
  await render(
    <QueryClientProvider client={cache}>
      <Branches actorId={actorA} context="owner" initialSection="billing-policy" />
    </QueryClientProvider>,
  );
  await userEvent.setup().press(await screen.findByRole('button', { name: 'Branch A' }));
  expect(screen.queryByRole('button', { name: 'Billing policy' })).toBeNull();
  expect(mockPolicy).not.toHaveBeenCalled();
  expect(mockBookings).toHaveBeenCalledWith({
    actorId: actorA,
    branchId: actorA,
    accessUnavailable: false,
  });
});
