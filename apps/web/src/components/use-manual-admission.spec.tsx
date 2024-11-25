import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createManualStay, readInventoryAccess, ApiFailure } from '@hsm/api-client';
import { manualAdmissionCommandSchema, type InventoryAccess } from '@hsm/contracts';
import { useManualAdmission } from '../lib/use-manual-admission';
import {
  admissionUiManual,
  admissionUiId as id,
  admissionUiOther as other,
} from './admission-ui.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  createManualStay: vi.fn(),
  readInventoryAccess: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const caches: QueryClient[] = [];
const grants: InventoryAccess['permissions'] = ['stay_manage', 'rent_manage', 'finance_view'];
const response = {
  branchId: id,
  stayId: id,
  residentId: id,
  agreementId: id,
  assignmentId: id,
  state: 'active' as const,
  version: 1 as const,
};
function command() {
  return manualAdmissionCommandSchema.parse({
    manual: admissionUiManual(),
    initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: id,
    permissions: grants,
    canConfigureManagers: false,
  });
  vi.mocked(createManualStay).mockResolvedValue(response);
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function fixture() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
  }
  const hook = renderHook(
    ({ branch, unavailable }) => useManualAdmission(id, branch, unavailable),
    { initialProps: { branch: id, unavailable: false }, wrapper: Wrapper },
  );
  return { ...hook, cache };
}
it('STAY-001 / ACC-004: current triple grants authorize a command and repeated calls retain its UUID key', async () => {
  const f = fixture();
  await waitFor(() => expect(f.result.current.allowed).toBe(true));
  await act(async () => {
    await f.result.current.mutation.mutateAsync(command());
  });
  const first = vi.mocked(createManualStay).mock.calls[0];
  expect(first?.[1]).toBe(id);
  expect(first?.[2]).toEqual(command());
  expect(first?.[3]).toMatch(/^[0-9a-f-]{36}$/);
  await act(async () => {
    await f.result.current.mutation.mutateAsync(command());
  });
  expect(vi.mocked(createManualStay).mock.calls[1]?.[3]).toBe(first?.[3]);
  expect(f.result.current.uncertain).toBe(false);
});
it.each(grants)(
  'SEC-003: missing %s blocks submission without allocating an intent',
  async (missing) => {
    vi.mocked(readInventoryAccess).mockResolvedValue({
      branchId: id,
      permissions: grants.filter((grant) => grant !== missing),
      canConfigureManagers: false,
    });
    const f = fixture();
    await waitFor(() => expect(f.result.current.access.isSuccess).toBe(true));
    await act(async () => {
      await expect(f.result.current.mutation.mutateAsync(command())).rejects.toThrow();
    });
    expect(createManualStay).not.toHaveBeenCalled();
    expect(f.result.current.uncertain).toBe(false);
  },
);
it('ACC-004: an unknown result cannot be replaced with another body and resolves only using the original key', async () => {
  vi.mocked(createManualStay).mockRejectedValueOnce(Error('Connection lost'));
  const f = fixture();
  await waitFor(() => expect(f.result.current.allowed).toBe(true));
  await act(async () => {
    await expect(f.result.current.mutation.mutateAsync(command())).rejects.toThrow(
      'Connection lost',
    );
  });
  await waitFor(() => expect(f.result.current.allowed).toBe(true));
  expect(f.result.current.uncertain).toBe(true);
  const changed = command();
  changed.manual.terms.depositPaisa = 5;
  await act(async () => {
    await expect(f.result.current.mutation.mutateAsync(changed)).rejects.toThrow();
  });
  expect(createManualStay).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(f.result.current.allowed).toBe(true));
  await act(async () => {
    await f.result.current.mutation.mutateAsync(command());
  });
  expect(vi.mocked(createManualStay).mock.calls[1]?.[3]).toBe(
    vi.mocked(createManualStay).mock.calls[0]?.[3],
  );
  expect(f.result.current.uncertain).toBe(false);
});
it('SEC-003: a changed branch cannot reuse the mounted workflow intent', async () => {
  const f = fixture();
  await waitFor(() => expect(f.result.current.allowed).toBe(true));
  await act(async () => {
    await f.result.current.mutation.mutateAsync(command());
  });
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: other,
    permissions: grants,
    canConfigureManagers: false,
  });
  f.rerender({ branch: other, unavailable: false });
  await waitFor(() => expect(f.result.current.allowed).toBe(true));
  await act(async () => {
    await expect(f.result.current.mutation.mutateAsync(command())).rejects.toThrow();
  });
  expect(createManualStay).toHaveBeenCalledTimes(1);
});
it('ACC-004: refresh failures do not turn a verified server admission into an uncertain result', async () => {
  const f = fixture();
  await waitFor(() => expect(f.result.current.allowed).toBe(true));
  const refresh = vi.spyOn(f.cache, 'invalidateQueries').mockRejectedValue(Error('Refresh failed'));
  await act(async () => {
    await f.result.current.mutation.mutateAsync(command());
  });
  expect(f.result.current.mutation.isSuccess).toBe(true);
  expect(f.result.current.uncertain).toBe(false);
  expect(f.result.current.refreshFailed).toBe(true);
  expect(refresh).toHaveBeenCalledWith({ queryKey: ['private-stays', id, id] });
  expect(refresh).toHaveBeenCalledWith({ queryKey: ['branch-inventory-pages', id, id] });
});
it('SEC-003: externally unavailable branch access blocks writes despite prior successful access reads', async () => {
  const f = fixture();
  await waitFor(() => expect(f.result.current.allowed).toBe(true));
  f.rerender({ branch: id, unavailable: true });
  await act(async () => {
    await expect(f.result.current.mutation.mutateAsync(command())).rejects.toThrow();
  });
  expect(createManualStay).not.toHaveBeenCalled();
  expect(f.result.current.allowed).toBe(false);
});
function rejected(status: number) {
  return new ApiFailure({
    type: 'https://hsm.invalid/problems/request',
    title: 'Request failed',
    status,
    code: status === 500 ? 'INTERNAL' : 'CONFLICT',
    detail: 'Request rejected',
    traceId: 'test-trace',
  });
}
it.each([403, 409, 422])(
  'ACC-004: a first authoritative %i rejection permits corrected intent with a new key',
  async (status) => {
    vi.mocked(createManualStay).mockRejectedValueOnce(rejected(status));
    const f = fixture();
    await waitFor(() => expect(f.result.current.allowed).toBe(true));
    await act(async () => {
      await expect(f.result.current.mutation.mutateAsync(command())).rejects.toThrow();
    });
    await waitFor(() => expect(f.result.current.allowed).toBe(true));
    expect(f.result.current.uncertain).toBe(false);
    const changed = command();
    changed.manual.terms.depositPaisa = 5;
    await act(async () => {
      await f.result.current.mutation.mutateAsync(changed);
    });
    expect(vi.mocked(createManualStay).mock.calls[1]?.[3]).not.toBe(
      vi.mocked(createManualStay).mock.calls[0]?.[3],
    );
  },
);
it('ACC-004: a later denial cannot discard an earlier unknown result', async () => {
  vi.mocked(createManualStay)
    .mockRejectedValueOnce(Error('Connection lost'))
    .mockRejectedValueOnce(rejected(403));
  const f = fixture();
  await waitFor(() => expect(f.result.current.allowed).toBe(true));
  await act(async () => {
    await expect(f.result.current.mutation.mutateAsync(command())).rejects.toThrow();
  });
  await waitFor(() => expect(f.result.current.allowed).toBe(true));
  await act(async () => {
    await expect(f.result.current.mutation.mutateAsync(command())).rejects.toThrow();
  });
  await waitFor(() => expect(f.result.current.allowed).toBe(true));
  expect(f.result.current.uncertain).toBe(true);
  const changed = command();
  changed.manual.terms.depositPaisa = 5;
  await act(async () => {
    await expect(f.result.current.mutation.mutateAsync(changed)).rejects.toThrow();
  });
  expect(createManualStay).toHaveBeenCalledTimes(2);
  expect(vi.mocked(createManualStay).mock.calls[1]?.[3]).toBe(
    vi.mocked(createManualStay).mock.calls[0]?.[3],
  );
});
it('ACC-004: an internal server failure retains the original intent for outcome resolution', async () => {
  vi.mocked(createManualStay).mockRejectedValueOnce(rejected(500));
  const f = fixture();
  await waitFor(() => expect(f.result.current.allowed).toBe(true));
  await act(async () => {
    await expect(f.result.current.mutation.mutateAsync(command())).rejects.toThrow();
  });
  await waitFor(() => expect(f.result.current.uncertain).toBe(true));
});
