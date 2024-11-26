import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as sdk from '@hsm/api-client';
import { PlatformAuditOperations, PlatformOverviewOperations } from './admin-operations-insights';

vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readPlatformOverview: vi.fn(),
  readPlatformAudit: vi.fn(),
  downloadPlatformAudit: vi.fn(),
}));

vi.mock('./admin-operations', async (original) => ({
  ...(await original<typeof import('./admin-operations')>()),
  useOperationScope: (actorId: string, module: string) => ({
    key: ['phase5-ui-test', actorId, module],
    read: async (work: (client: never) => Promise<unknown>) => work({} as never),
  }),
}));

const id = '10000000-0000-4000-8000-000000000001';

const overview = {
  generatedAt: '2026-10-30T10:00:00.000Z',
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
    announcements: {
      scheduled: 1,
      sent: 4,
      cancelled: 0,
    },
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

const auditEvent = {
  id,
  createdAt: '2026-10-30T10:00:00.000Z',
  action: 'verification.approve',
  actorRole: 'root',
  actorId: id,
  targetType: 'branch',
  targetId: id,
};

function show(node: React.ReactNode) {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });

  return render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(sdk.readPlatformOverview).mockResolvedValue(
    overview as Awaited<ReturnType<typeof sdk.readPlatformOverview>>,
  );

  vi.mocked(sdk.readPlatformAudit).mockResolvedValue({
    data: [auditEvent],
    nextCursor: null,
  } as Awaited<ReturnType<typeof sdk.readPlatformAudit>>);

  vi.mocked(sdk.downloadPlatformAudit).mockResolvedValue({
    csv: 'id,action\nfixture,verification.approve',
    truncated: false,
  });
});

afterEach(cleanup);

it('RPT-003: analytics displays authoritative metrics and applies date range', async () => {
  show(<PlatformOverviewOperations actorId={id} />);

  expect(await screen.findByText('Current platform snapshot')).toBeTruthy();
  expect(screen.getByText(/Registered users 12/)).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Platform metrics from'), {
    target: { value: '2026-10-01' },
  });

  fireEvent.change(screen.getByLabelText('Platform metrics to'), {
    target: { value: '2026-10-30' },
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Apply metric dates',
    }),
  );

  await waitFor(() => {
    expect(sdk.readPlatformOverview).toHaveBeenLastCalledWith(expect.anything(), {
      from: '2026-10-01',
      to: '2026-10-30',
    });
  });
});

it('AUD-001: audit filters and CSV export preserve selected scope', async () => {
  show(<PlatformAuditOperations actorId={id} />);

  expect(await screen.findByText(/verification.approve/)).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Audit action filter'), {
    target: { value: 'verification.approve' },
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Apply audit filters',
    }),
  );

  await waitFor(() => {
    expect(sdk.readPlatformAudit).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'verification.approve',
        limit: 20,
      }),
    );
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Generate audit metadata CSV',
    }),
  );

  expect(
    await screen.findByRole('link', {
      name: 'Download audit metadata CSV',
    }),
  ).toBeTruthy();

  expect(sdk.downloadPlatformAudit).toHaveBeenCalledWith(expect.anything(), {
    action: 'verification.approve',
  });
});

it('SEC-003: failed CSV export exposes no download link', async () => {
  vi.mocked(sdk.downloadPlatformAudit).mockRejectedValue(new Error('Access denied'));

  show(<PlatformAuditOperations actorId={id} />);

  await screen.findByText(/verification.approve/);

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Generate audit metadata CSV',
    }),
  );

  await screen.findByRole('alert');

  expect(
    screen.queryByRole('link', {
      name: 'Download audit metadata CSV',
    }),
  ).toBeNull();
});
