import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as sdk from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { PlatformAuditOperations } from './admin-operations-insights';

vi.mock('../../lib/client', () => ({
  browserClient: vi.fn(),
}));

vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readApi: vi.fn(),
  readPlatformAudit: vi.fn(),
  downloadPlatformAudit: vi.fn(),
}));

const id = '10000000-0000-4000-8000-000000000001';

const root = {
  user: { id },
  capabilities: {
    admin: { isRoot: true, roles: [] },
  },
};

const revoked = {
  user: { id },
  capabilities: {
    admin: { isRoot: false, roles: ['support'] },
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

function show() {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={cache}>
      <PlatformAuditOperations actorId={id} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(browserClient).mockReturnValue({
    GET: vi.fn().mockResolvedValue({ data: {} }),
  } as never);

  vi.mocked(sdk.readApi).mockResolvedValue(root as never);

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

it('SEC-003: revoked Root cannot begin reading audit records', async () => {
  vi.mocked(sdk.readApi).mockResolvedValue(revoked as never);

  show();

  await waitFor(() => {
    expect(sdk.readApi).toHaveBeenCalled();
  });

  expect(sdk.readPlatformAudit).not.toHaveBeenCalled();

  expect(screen.queryByText(/verification\.approve/)).toBeNull();
});

it('SEC-003: permission revoked during audit read prevents disclosure', async () => {
  vi.mocked(sdk.readApi)
    .mockResolvedValueOnce(root as never)
    .mockResolvedValueOnce(revoked as never);

  show();

  await waitFor(() => {
    expect(sdk.readApi).toHaveBeenCalledTimes(2);
  });

  expect(sdk.readPlatformAudit).toHaveBeenCalledTimes(1);

  expect(screen.queryByText(/verification\.approve/)).toBeNull();
});

it('SEC-003: revoked permission during CSV generation exposes no download', async () => {
  show();

  await screen.findByText(/verification\.approve/);

  vi.mocked(sdk.readApi)
    .mockResolvedValueOnce(root as never)
    .mockResolvedValueOnce(revoked as never);

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Generate audit metadata CSV',
    }),
  );

  await waitFor(() => {
    expect(sdk.downloadPlatformAudit).toHaveBeenCalledTimes(1);
  });

  await waitFor(() => {
    expect(sdk.readApi).toHaveBeenCalledTimes(4);
  });

  expect(
    screen.queryByRole('link', {
      name: 'Download audit metadata CSV',
    }),
  ).toBeNull();
});

it('SEC-003: previously generated audit CSV is cleared when actor changes', async () => {
  const otherActor = '10000000-0000-4000-8000-000000000002';

  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });

  const page = (actorId: string) => (
    <QueryClientProvider client={cache}>
      <PlatformAuditOperations actorId={actorId} />
    </QueryClientProvider>
  );

  const view = render(page(id));

  await screen.findByText(/verification\.approve/);

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

  const previousChecks = vi.mocked(sdk.readApi).mock.calls.length;

  view.rerender(page(otherActor));

  await waitFor(() => {
    expect(vi.mocked(sdk.readApi).mock.calls.length).toBeGreaterThan(previousChecks);
  });

  await waitFor(() => {
    expect(
      screen.queryByRole('link', {
        name: 'Download audit metadata CSV',
      }),
    ).toBeNull();
  });
});
