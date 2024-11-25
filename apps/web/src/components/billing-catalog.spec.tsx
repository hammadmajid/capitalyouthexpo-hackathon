import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  readBillingCatalog,
  createBillingCatalogEntry,
  archiveBillingCatalogEntry,
} from '@hsm/api-client';
import { BillingCatalog } from './billing-catalog';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readBillingCatalog: vi.fn(),
  createBillingCatalogEntry: vi.fn(),
  archiveBillingCatalogEntry: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const actorId = randomUUID(),
  branchId = randomUUID();
const entry = {
  id: randomUUID(),
  branchId,
  code: 'electricity_kwh_v1',
  name: 'Electricity',
  unitLabel: 'kWh',
  unitAmountPaisa: 3500,
  createdAt: '2026-10-19T10:00:00.000Z',
  archivedAt: null,
};
const page = { branchId, canEdit: true, includeArchived: false, data: [entry], nextCursor: null };
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readBillingCatalog).mockResolvedValue(page);
  vi.mocked(createBillingCatalogEntry).mockResolvedValue(entry);
  vi.mocked(archiveBillingCatalogEntry).mockResolvedValue({
    ...entry,
    archivedAt: entry.createdAt,
  });
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function show() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  const tree = (actor = actorId, unavailable = false) => (
    <QueryClientProvider client={cache}>
      <BillingCatalog actorId={actor} branchId={branchId} accessUnavailable={unavailable} />
    </QueryClientProvider>
  );
  return { tree, ...render(tree()) };
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Approved charges' }));
  await screen.findByText('Electricity');
}
function fill() {
  for (const [name, value] of [
    ['Charge code', 'electricity_kwh_v1'],
    ['Charge name', 'Electricity'],
    ['Unit label', 'kWh'],
    ['Unit price (PKR)', '35.00'],
  ])
    fireEvent.change(screen.getByLabelText(name ?? ''), { target: { value } });
}
it('FIN-004 / ACC-004: catalogue is lazy, scoped and shows exact retained PKR prices', async () => {
  show();
  expect(readBillingCatalog).not.toHaveBeenCalled();
  await open();
  expect(readBillingCatalog).toHaveBeenCalledWith({}, branchId, {
    limit: 20,
    includeArchived: 'false',
  });
  expect(screen.getByText('Rs 35.00 per kWh')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Create approved charge' })).not.toBeNull();
});
it('ACC-004: Manager read-only response never exposes create or archive actions', async () => {
  vi.mocked(readBillingCatalog).mockResolvedValue({ ...page, canEdit: false });
  show();
  await open();
  expect(screen.queryByRole('button', { name: 'Create approved charge' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archive Electricity' })).toBeNull();
  expect(screen.getByText(/Only the owning Owner/)).not.toBeNull();
});
it('FIN-004: invalid price is rejected before the SDK and entered values remain', async () => {
  show();
  await open();
  fill();
  fireEvent.change(screen.getByLabelText('Unit price (PKR)'), { target: { value: '0' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Create approved charge' }));
  await screen.findByText(/Enter a valid charge code/);
  expect(createBillingCatalogEntry).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Charge name').getAttribute('value')).toBe('Electricity');
});
it('FIN-004 / AUD-004: create waits for persisted response and refresh, then reports success', async () => {
  show();
  await open();
  fill();
  fireEvent.submit(screen.getByRole('form', { name: 'Create approved charge' }));
  await screen.findByText('Approved charge created.');
  expect(createBillingCatalogEntry).toHaveBeenCalledWith(
    {},
    branchId,
    { code: entry.code, name: entry.name, unitLabel: entry.unitLabel, unitAmountPaisa: 3500 },
    expect.any(String),
  );
  await waitFor(() => expect(readBillingCatalog).toHaveBeenCalledTimes(2));
});
it('ACC-004: access refresh hides retained prices, and actor changes restart closed', async () => {
  const view = show();
  await open();
  view.rerender(view.tree(actorId, true));
  expect(screen.queryByText('Electricity')).toBeNull();
  await screen.findByText(/Refresh branch access/);
  view.rerender(view.tree(randomUUID()));
  expect(screen.queryByText('Electricity')).toBeNull();
  expect(screen.getByRole('button', { name: 'Approved charges' })).not.toBeNull();
  expect(readBillingCatalog).toHaveBeenCalledTimes(1);
});
it('AUD-004: archive requires a reason and exact selected record', async () => {
  show();
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Archive Electricity' }));
  fireEvent.submit(screen.getByRole('form', { name: 'Archive approved charge' }));
  await screen.findByText('Enter a reason before archiving this charge.');
  expect(archiveBillingCatalogEntry).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Archive reason'), {
    target: { value: ' Replaced tariff ' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Archive approved charge' }));
  await screen.findByText('Approved charge archived.');
  expect(archiveBillingCatalogEntry).toHaveBeenCalledWith(
    {},
    { branchId, catalogId: entry.id },
    { reason: 'Replaced tariff' },
    expect.any(String),
  );
});

it('FIN-004 / AUD-004: failed create retains draft and same-intent retry key until persisted success', async () => {
  vi.mocked(createBillingCatalogEntry).mockRejectedValueOnce(new Error('Offline'));
  show();
  await open();
  fill();
  fireEvent.submit(screen.getByRole('form', { name: 'Create approved charge' }));
  await screen.findByRole('button', { name: 'Retry approved charges' });
  expect(screen.queryByText('Electricity')).toBeNull();
  expect(screen.queryByText('Approved charge created.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry approved charges' }));
  await screen.findByText('Electricity');
  expect(screen.getByLabelText('Charge name').getAttribute('value')).toBe('Electricity');
  fireEvent.submit(screen.getByRole('form', { name: 'Create approved charge' }));
  await screen.findByText('Approved charge created.');
  expect(createBillingCatalogEntry).toHaveBeenCalledTimes(2);
  expect(vi.mocked(createBillingCatalogEntry).mock.calls[0]?.[3]).toBe(
    vi.mocked(createBillingCatalogEntry).mock.calls[1]?.[3],
  );
});
it('SEC-003: pending and failed refresh hide cached prices and write controls until successful retry', async () => {
  let finish: ((value: typeof page) => void) | undefined;
  show();
  await open();
  vi.mocked(readBillingCatalog).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh approved charges' }));
  await screen.findByText('Loading approved charges…');
  expect(screen.queryByText('Electricity')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create approved charge' })).toBeNull();
  finish?.(page);
  await screen.findByText('Electricity');
  vi.mocked(readBillingCatalog).mockRejectedValueOnce(new Error('Revoked'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh approved charges' }));
  await screen.findByRole('button', { name: 'Retry approved charges' });
  expect(screen.queryByText('Electricity')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry approved charges' }));
  await screen.findByText('Electricity');
});
it('FIN-004 / ACC-004: bounded next/history/reset controls use the requested view and retained archive labels', async () => {
  vi.mocked(readBillingCatalog).mockResolvedValueOnce({ ...page, nextCursor: entry.id });
  show();
  await open();
  vi.mocked(readBillingCatalog).mockResolvedValueOnce({ ...page, data: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Next approved charges' }));
  await screen.findByText('No approved charges on this page.');
  expect(readBillingCatalog).toHaveBeenLastCalledWith({}, branchId, {
    limit: 20,
    cursor: entry.id,
    includeArchived: 'false',
  });
  fireEvent.click(screen.getByRole('button', { name: 'First approved charges' }));
  await screen.findByText('Electricity');
  vi.mocked(readBillingCatalog).mockResolvedValueOnce({
    ...page,
    includeArchived: true,
    data: [{ ...entry, archivedAt: entry.createdAt }],
  });
  fireEvent.click(screen.getByLabelText('Include archived charges'));
  await screen.findByText('Archived');
  expect(readBillingCatalog).toHaveBeenLastCalledWith({}, branchId, {
    limit: 20,
    includeArchived: 'true',
  });
  expect(screen.queryByRole('button', { name: 'Archive Electricity' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close approved charges' }));
  expect(screen.queryByText('Electricity')).toBeNull();
});
it('AUD-004: cancelling archive never sends a command', async () => {
  show();
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Archive Electricity' }));
  fireEvent.change(screen.getByLabelText('Archive reason'), {
    target: { value: 'Keep this charge' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel charge archive' }));
  expect(screen.queryByLabelText('Archive reason')).toBeNull();
  expect(archiveBillingCatalogEntry).not.toHaveBeenCalled();
});
