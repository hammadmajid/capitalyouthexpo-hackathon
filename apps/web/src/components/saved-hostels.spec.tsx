import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiFailure, listSavedHostels, saveHostel } from '@hsm/api-client';
import { listingSummarySchema } from '@hsm/contracts';
import { SavedHostels } from './saved-hostels';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listSavedHostels: vi.fn(),
  saveHostel: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const actorId = randomUUID(),
  branchId = randomUUID();
const listing = listingSummarySchema.parse({
  branchId,
  brandName: 'Fixture brand',
  name: 'Fixture hostel',
  slug: 'fixture',
  category: 'boys',
  city: 'Islamabad',
  area: 'H-13',
  latitude: 33.6,
  longitude: 73.1,
  priceFromPaisa: 1800001,
  verified: true,
  availableBeds: null,
  availableWholeRooms: null,
  amenities: [],
  media: [],
  distanceMeters: null,
});
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listSavedHostels).mockResolvedValue({ data: [listing], nextCursor: null });
});
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
});
function show() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  return {
    ...render(
      <QueryClientProvider client={cache}>
        <SavedHostels actorId={actorId} />
      </QueryClientProvider>,
    ),
    cache,
  };
}
it('ACC-002: Saved displays approved server listings and exact integer prices', async () => {
  await act(async () => {
    show();
  });
  await screen.findByRole('link', { name: 'Fixture hostel' });
  expect(screen.getByRole('link', { name: 'Fixture hostel' }).getAttribute('href')).toBe(
    '/hostels/' + branchId,
  );
  expect(screen.getByText(/From PKR/).textContent).toContain('18,000.01');
  expect(listSavedHostels).toHaveBeenCalledWith({}, { limit: 20 });
  expect(document.body.textContent).not.toContain(actorId);
});
it('ACC-002: successful empty Saved state is distinct from an outage', async () => {
  vi.mocked(listSavedHostels).mockRejectedValue(new Error('Offline'));
  show();
  await screen.findByRole('alert');
  expect(screen.queryByText('No approved Saved hostels are available.')).toBeNull();
  vi.mocked(listSavedHostels).mockResolvedValue({ data: [], nextCursor: null });
  fireEvent.click(screen.getByRole('button', { name: 'Retry Saved hostels' }));
  await screen.findByText('No approved Saved hostels are available.');
});
it('ACC-002: removal waits for server persistence and refreshes the actual list', async () => {
  let finish: ((result: Awaited<ReturnType<typeof saveHostel>>) => void) | undefined;
  vi.mocked(saveHostel).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Fixture hostel from Saved' }));
  await waitFor(() => expect(saveHostel).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('link', { name: 'Fixture hostel' })).toBeDefined();
  expect(screen.queryByText('Saved preference updated by the server.')).toBeNull();
  vi.mocked(listSavedHostels).mockResolvedValue({ data: [], nextCursor: null });
  finish?.({ branchId, saved: false });
  await screen.findByText('No approved Saved hostels are available.');
  await screen.findByText('Saved preference updated by the server.');
});
it('ACC-002: interrupted removal retains its idempotency key', async () => {
  vi.mocked(saveHostel).mockRejectedValue(new Error('Interrupted'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Fixture hostel from Saved' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Remove Fixture hostel from Saved' }));
  await waitFor(() => expect(saveHostel).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(saveHostel).mock.calls;
  expect(calls[0]?.slice(0, 3)).toEqual([{}, branchId, false]);
  expect(calls[0]?.[3]).toBe(calls[1]?.[3]);
});
it.each([
  { branchId: randomUUID(), saved: false },
  { branchId, saved: true },
])('SEC-003: mismatched Saved responses cannot show success', async (result) => {
  vi.mocked(saveHostel).mockResolvedValue(result);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Fixture hostel from Saved' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Saved preference updated by the server.')).toBeNull();
  expect(screen.getByRole('link', { name: 'Fixture hostel' })).toBeDefined();
});
it('SEC-003: account changes discard previous private Saved data', async () => {
  const mounted = show();
  await screen.findByRole('link', { name: 'Fixture hostel' });
  vi.mocked(listSavedHostels).mockResolvedValue({ data: [], nextCursor: null });
  mounted.rerender(
    <QueryClientProvider client={mounted.cache}>
      <SavedHostels actorId={randomUUID()} />
    </QueryClientProvider>,
  );
  await screen.findByText('No approved Saved hostels are available.');
  expect(screen.queryByRole('link', { name: 'Fixture hostel' })).toBeNull();
});
it('SEC-003: revoked Saved access hides cached listings', async () => {
  vi.mocked(saveHostel).mockRejectedValue(
    new ApiFailure({
      type: 'https://example.test/problem',
      title: 'Denied',
      status: 403,
      code: 'FORBIDDEN',
      detail: 'Unavailable',
      traceId: 'fixture',
    }),
  );
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Fixture hostel from Saved' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('link', { name: 'Fixture hostel' })).toBeNull();
});
it('ACC-002: Saved pagination retains previous results and sends the real cursor', async () => {
  vi.mocked(listSavedHostels)
    .mockResolvedValueOnce({ data: [listing], nextCursor: branchId })
    .mockResolvedValueOnce({
      data: [{ ...listing, branchId: randomUUID(), name: 'Second hostel' }],
      nextCursor: null,
    });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'More Saved hostels' }));
  await screen.findByRole('link', { name: 'Second hostel' });
  expect(screen.getByRole('link', { name: 'Fixture hostel' })).toBeDefined();
  expect(listSavedHostels).toHaveBeenLastCalledWith({}, { limit: 20, cursor: branchId });
});
