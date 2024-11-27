import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as sdk from '@hsm/api-client';
import { PlatformInsights } from './platform-insights';
import { PlatformAuditBrowser } from './audit-browser';
import { pickDate } from '../../test-utils/pick-date';

const id = '10000000-0000-4000-8000-000000000001';
const secondId = '10000000-0000-4000-8000-000000000002';
const at = '2026-10-30T10:00:00.000Z';

const mockProfile = {
  user: { id, fullName: 'Root fixture' },
  capabilities: {
    admin: { isRoot: true, roles: [] },
    customer: false,
    owner: false,
    managerOf: [],
  },
};

jest.mock('expo-router', () => ({
  useFocusEffect: (work: import('react').EffectCallback) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  },
}));
jest.mock('../providers', () => ({
  useSession: () => ({
    profile: mockProfile,
    refetch: async () => mockProfile,
  }),
}));

jest.mock('../../lib/runtime', () => ({
  actorClient: async () => ({}),
  sessions: { restore: jest.fn() },
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
  readPlatformOverview: jest.fn(),
  readPlatformAudit: jest.fn(),
}));

const overview = {
  generatedAt: at,
  from: '2026-10-01',
  to: '2026-10-30',
  snapshot: {
    users: 100,
    customers: 70,
    owners: 20,
    activeBranches: 10,
    publishedListings: 8,
    activeManagers: 5,
    verificationPending: 2,
    supportPending: 3,
    moderationPending: 1,
    announcements: { scheduled: 1, sent: 4, cancelled: 0 },
  },
  window: {
    registeredUsers: 12,
    bookingRequests: 7,
    conversations: 3,
    visitRequests: 2,
    checkedIn: 1,
    bookingStates: [{ state: 'pending', count: 7 }],
    respondedRequests: 5,
    averageResponseHours: 2,
    slowResponses: 0,
  },
};

const event = {
  id,
  createdAt: at,
  action: 'verification.approve',
  actorRole: 'root',
  actorId: id,
  targetType: 'branch',
  targetId: id,
};

beforeEach(() => {
  jest.clearAllMocks();

  jest
    .mocked(sdk.readPlatformOverview)
    .mockResolvedValue(overview as Awaited<ReturnType<typeof sdk.readPlatformOverview>>);

  jest.mocked(sdk.readPlatformAudit).mockResolvedValue({
    data: [event],
    nextCursor: null,
  } as Awaited<ReturnType<typeof sdk.readPlatformAudit>>);
});

function show(node: ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false, gcTime: 0 },
          },
        })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}

it('RPT-003: Native analytics applies a new valid date range', async () => {
  await show(<PlatformInsights />);

  await screen.findByText('Current platform snapshot');
  await fireEvent.press(screen.getByRole('button', { name: 'Open verification queue' }));
  expect(router.push).toHaveBeenCalledWith('/admin/verifications');

  await fireEvent.press(screen.getByRole('button', { name: 'Filters and sorting' }));
  await pickDate('From', '2026-02-01');

  await pickDate('To', '2026-02-28');

  await fireEvent.press(screen.getByRole('button', { name: 'Apply analytics dates' }));

  await waitFor(() => {
    expect(sdk.readPlatformOverview).toHaveBeenLastCalledWith(expect.anything(), {
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });
});

it('RPT-003: invalid analytics dates do not submit a new request', async () => {
  await show(<PlatformInsights />);

  await screen.findByText('Current platform snapshot');

  const previousCalls = jest.mocked(sdk.readPlatformOverview).mock.calls.length;

  await fireEvent.press(screen.getByRole('button', { name: 'Filters and sorting' }));
  await pickDate('From', '2026-12-31');

  await pickDate('To', '2026-01-01');

  await fireEvent.press(screen.getByRole('button', { name: 'Apply analytics dates' }));

  expect(screen.getByText('Enter valid dates with From on or before To.')).toBeTruthy();

  expect(sdk.readPlatformOverview).toHaveBeenCalledTimes(previousCalls);
});

it('AUD-001: Native audit applies exact server filters', async () => {
  await show(<PlatformAuditBrowser />);

  await screen.findByText('verification.approve');

  await fireEvent.press(screen.getByRole('button', { name: 'Filters and sorting' }));
  await fireEvent.changeText(screen.getByLabelText('Action (exact)'), 'verification.approve');

  await fireEvent.press(screen.getByRole('button', { name: 'Apply audit filters' }));

  await waitFor(() => {
    expect(sdk.readPlatformAudit).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'verification.approve',
        limit: 20,
      }),
    );
  });
});

it('AUD-001: Native audit pagination uses server continuation', async () => {
  jest
    .mocked(sdk.readPlatformAudit)
    .mockResolvedValueOnce({
      data: [event],
      nextCursor: id,
    } as Awaited<ReturnType<typeof sdk.readPlatformAudit>>)
    .mockResolvedValue({
      data: [
        {
          ...event,
          id: secondId,
          action: 'support.reply',
        },
      ],
      nextCursor: null,
    } as Awaited<ReturnType<typeof sdk.readPlatformAudit>>);

  await show(<PlatformAuditBrowser />);

  await screen.findByText('verification.approve');

  await fireEvent.press(screen.getByRole('button', { name: 'Load more' }));

  await screen.findByText('support.reply');

  await waitFor(() => {
    expect(sdk.readPlatformAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cursor: id }),
    );
  });
});
