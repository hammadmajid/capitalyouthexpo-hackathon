import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as sdk from '@hsm/api-client';
import { AdminAnnouncements } from './announcements';
import { AdminBookingPolicy } from './booking-policy';
import { CustomerGovernance } from './customer-governance';
import { AdminInstitutions } from './institutions';
const id = '10000000-0000-4000-8000-000000000001';
const at = '2026-10-30T10:00:00.000Z';
jest.mock('../providers', () => ({
  useSession: () => ({ profile: mockProfile, refetch: async () => mockProfile }),
}));
jest.mock('../../lib/runtime', () => ({
  actorClient: async () => ({}),
  sessions: { restore: jest.fn() },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
jest.mock('expo-router', () => ({
  useFocusEffect: (work: () => (() => void) | undefined) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
  router: { back: jest.fn(), push: jest.fn() },
}));
jest.mock('../frame', () => {
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Page: ({ title, children }: { title: string; children: ReactNode }) => (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ),
  };
});
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readAdminAnnouncements: jest.fn(),
  createAnnouncement: jest.fn(),
  cancelAnnouncement: jest.fn(),
  readBookingSettings: jest.fn(),
  saveBookingSettings: jest.fn(),
  listAdminInstitutions: jest.fn(),
  listGovernedCustomers: jest.fn(),
  decideCustomer: jest.fn(),
  readAdminInstitutionHistory: jest.fn(),
  readAdminInstitution: jest.fn(),
  saveAdminInstitution: jest.fn(),
}));
const mockProfile = {
  user: { id, fullName: 'Root fixture' },
  capabilities: {
    admin: { isRoot: true, roles: [] },
    customer: false,
    owner: false,
    managerOf: [],
  },
};
const policy = {
  bookingMode: 'request' as const,
  holdSeconds: 60,
  requestExpirySeconds: 3600,
  requestReservesInventory: false,
  minimumStayDays: 1,
  maximumStayDays: 30,
  minimumAdvanceDays: 0,
  maximumAdvanceDays: 30,
  customerSelectsInventory: true,
  cancellationAllowed: true,
  cancellationCutoffHours: 24,
  allowedStayUnits: ['day' as const],
  allowEvidenceReuse: false,
  documentReviewRequired: false,
  requiredDocuments: [],
};
const limits = {
  maximumHoldSeconds: 120,
  maximumActiveHolds: 2,
  maximumRequestExpirySeconds: 7200,
  maximumAdvanceDays: 90,
  maximumFiniteStayDays: 365,
};
const institution = {
  revision: '0',
  id,
  name: 'Fixture university',
  shortName: null,
  cityId: id,
  areaId: null,
  address: null,
  latitude: 33,
  longitude: 73,
  aliases: [],
  isActive: true,
  publicApproved: true,
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(sdk.readAdminAnnouncements).mockResolvedValue({ data: [], nextCursor: null });
  jest
    .mocked(sdk.listAdminInstitutions)
    .mockResolvedValue({ data: [institution], nextCursor: null });
  jest.mocked(sdk.readAdminInstitution).mockResolvedValue(institution);
  jest.mocked(sdk.readAdminInstitutionHistory).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(sdk.readBookingSettings).mockResolvedValue({
    configured: true,
    target: { level: 'platform', scopeId: null },
    canEdit: true,
    localVersion: { id, level: 'platform', scopeId: null },
    overrides: null,
    inherited: null,
    effective: policy,
    limits,
    lineage: [{ id, level: 'platform', scopeId: null }],
  });
});
async function show(node: ReactNode) {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return {
    cache,
    ...(await render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>)),
  };
}
it('ADM-010: announcement preview is not a send; confirmed audience and plain text are exact', async () => {
  await show(<AdminAnnouncements />);
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Operational notice');
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Actual plain text');
  await fireEvent.press(screen.getByRole('button', { name: 'Preview announcement' }));
  expect(sdk.createAnnouncement).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm announcement' }));
  await waitFor(() =>
    expect(sdk.createAnnouncement).toHaveBeenCalledWith(
      expect.anything(),
      {
        audience: 'all_managers',
        title: 'Operational notice',
        body: 'Actual plain text',
        branchIds: [],
      },
      expect.any(String),
    ),
  );
});
it('ADM-010: invalid schedule cannot be previewed or sent', async () => {
  await show(<AdminAnnouncements />);
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Notice');
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Message');
  await fireEvent.changeText(
    screen.getByLabelText('Schedule (YYYY-MM-DDTHH:mm, PKT)'),
    'not-a-date',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Preview announcement' }));
  expect(
    screen.getByText('Check the title, message, audience IDs and future Pakistan schedule.'),
  ).toBeTruthy();
  expect(sdk.createAnnouncement).not.toHaveBeenCalled();
});
it('BKG-006 ADM-001: Root policy confirmation carries current version and exact defaults', async () => {
  await show(<AdminBookingPolicy />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Edit platform booking policy' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Review booking policy changes' }));
  expect(sdk.saveBookingSettings).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm platform booking policy' }));
  await waitFor(() =>
    expect(sdk.saveBookingSettings).toHaveBeenCalledWith(
      expect.anything(),
      { level: 'platform' },
      { policy, limits, expectedCurrentVersionId: id },
      expect.any(String),
    ),
  );
});
it('BKG-006: a first platform policy is typed in minutes and hours and saved in exact seconds', async () => {
  jest.mocked(sdk.readBookingSettings).mockResolvedValueOnce({
    configured: false,
    target: { level: 'platform', scopeId: null },
    canEdit: true,
    localVersion: null,
    overrides: null,
    inherited: null,
    effective: null,
    limits: null,
    lineage: [],
  } as never);
  await show(<AdminBookingPolicy />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Edit platform booking policy' }),
  );
  const type = (label: string, value: string) =>
    fireEvent.changeText(screen.getByLabelText(label), value);
  await type('Hold a bed for (minutes)', '15');
  await type('Request expires after (hours)', '24');
  await type('Shortest stay (days)', '1');
  await type('Book at least (days ahead)', '0');
  await type('Book at most (days ahead)', '60');
  await type('Cancel up to (hours before)', '12');
  await fireEvent.press(screen.getByRole('button', { name: 'Rules tab' }));
  for (const label of [
    'Hold the bed while a request waits',
    'Customer picks the exact bed',
    'Customer can cancel',
    'Reuse documents from earlier bookings',
    'Staff check documents first',
  ])
    await fireEvent.press(screen.getByRole('button', { name: label + ': Yes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Month' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Limits tab' }));
  await type('Longest hold any hostel can set (minutes)', '60');
  await type('Holds one customer can have at once', '3');
  await type('Longest request wait (hours)', '72');
  await type('Furthest booking ahead (days)', '90');
  await type('Longest stay any hostel can set (days)', '365');
  await fireEvent.press(screen.getByRole('button', { name: 'Review booking policy changes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm platform booking policy' }));
  await waitFor(() =>
    expect(sdk.saveBookingSettings).toHaveBeenCalledWith(
      expect.anything(),
      { level: 'platform' },
      expect.objectContaining({
        policy: expect.objectContaining({
          bookingMode: 'request',
          holdSeconds: 900,
          requestExpirySeconds: 86400,
          maximumStayDays: 'unlimited',
          allowedStayUnits: ['month'],
          requiredDocuments: [],
        }),
        limits: expect.objectContaining({
          maximumHoldSeconds: 3600,
          maximumRequestExpirySeconds: 259200,
        }),
      }),
      expect.any(String),
    ),
  );
});
it('GEO-003 AUD-004: institution deactivation preserves identity and needs confirmation', async () => {
  await show(<AdminInstitutions />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Edit place: Fixture university' }),
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Shown in search: Yes' }));
  await fireEvent.changeText(
    screen.getByLabelText('Reason for this change'),
    'Institution temporarily inactive',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Review institution save' }));
  expect(sdk.saveAdminInstitution).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm institution save' }));
  await waitFor(() =>
    expect(sdk.saveAdminInstitution).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: institution.name, isActive: false }),
      expect.any(String),
      id,
    ),
  );
});

it('HMA-015: customer enforcement requires a meaningful reason and explicit confirmation', async () => {
  jest.mocked(sdk.listGovernedCustomers).mockResolvedValue({
    data: [{ userId: id, fullName: 'Customer fixture', status: 'active', updatedAt: at }],
    nextCursor: null,
  });
  await show(<CustomerGovernance />);
  await screen.findByText('Customer fixture');
  await fireEvent.press(screen.getByRole('button', { name: 'warn customer' }));
  await fireEvent.changeText(
    screen.getByLabelText('Decision reason for Customer fixture'),
    'Too short',
  );
  expect(screen.getByRole('button', { name: 'Confirm customer decision' })).toBeEnabled();
  await fireEvent.changeText(
    screen.getByLabelText('Decision reason for Customer fixture'),
    'short',
  );
  expect(screen.getByRole('button', { name: 'Confirm customer decision' })).toBeDisabled();
  await fireEvent.changeText(
    screen.getByLabelText('Decision reason for Customer fixture'),
    'Confirmed repeated harassment',
  );
  expect(sdk.decideCustomer).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm customer decision' }));
  await waitFor(() =>
    expect(sdk.decideCustomer).toHaveBeenCalledWith(
      expect.anything(),
      id,
      {
        action: 'warn',
        reason: 'Confirmed repeated harassment',
        expectedStatus: 'active',
        expectedUpdatedAt: at,
      },
      expect.any(String),
    ),
  );
});

it('GEO-003: focused institution editor returns to the same searched directory without saving', async () => {
  await show(<AdminInstitutions />);
  await screen.findByText('Fixture university');
  await fireEvent.press(screen.getByRole('button', { name: 'Search Places' }));
  await fireEvent.changeText(screen.getByLabelText('Place search'), 'Fixture');
  await fireEvent.press(screen.getByRole('button', { name: 'Search places' }));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Edit place: Fixture university' }),
  );
  await screen.findByLabelText('Name');
  expect(screen.queryByRole('button', { name: 'Add place' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  await screen.findByRole('button', { name: 'Add place' });
  expect(sdk.saveAdminInstitution).not.toHaveBeenCalled();
  // The editor also reads the city list ({ limit: 1 }); the directory keeps its search.
  const listCalls = jest
    .mocked(sdk.listAdminInstitutions)
    .mock.calls.filter(([, query]) => (query as { limit?: number }).limit !== 1);
  expect(listCalls.at(-1)?.[1]).toEqual(expect.objectContaining({ q: 'Fixture' }));
});

it('BKG-006: background updates do not upgrade an existing policy draft revision', async () => {
  const ui = await show(<AdminBookingPolicy />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Edit platform booking policy' }),
  );
  const current = await jest.mocked(sdk.readBookingSettings).mock.results.at(-1)?.value;
  const newer = '20000000-0000-4000-8000-000000000002';
  jest.mocked(sdk.readBookingSettings).mockResolvedValue({
    ...current,
    localVersion: { id: newer, level: 'platform', scopeId: null },
  });
  await act(async () => {
    await ui.cache.invalidateQueries({ queryKey: ['platform-admin', id] });
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Review booking policy changes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm platform booking policy' }));
  await waitFor(() =>
    expect(sdk.saveBookingSettings).toHaveBeenCalledWith(
      expect.anything(),
      { level: 'platform' },
      expect.objectContaining({ expectedCurrentVersionId: id }),
      expect.any(String),
    ),
  );
});
it('GEO-003: background institution updates preserve the draft original revision', async () => {
  const ui = await show(<AdminInstitutions />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Edit place: Fixture university' }),
  );
  await screen.findByLabelText('Name');
  jest.mocked(sdk.readAdminInstitution).mockResolvedValue({ ...institution, revision: '2' });
  await act(async () => {
    await ui.cache.invalidateQueries({ queryKey: ['platform-admin', id] });
  });
  await fireEvent.changeText(
    screen.getByLabelText('Reason for this change'),
    'Reviewed institution correction',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Review institution save' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm institution save' }));
  await waitFor(() =>
    expect(sdk.saveAdminInstitution).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expectedRevision: institution.revision }),
      expect.any(String),
      id,
    ),
  );
});
