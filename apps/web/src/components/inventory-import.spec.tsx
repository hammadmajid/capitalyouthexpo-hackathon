import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientFailure, executeInventoryImport, readInventoryImport } from '@hsm/api-client';
import { InventoryImport } from './inventory-import';
import { InventoryNavigationProvider } from './inventory-navigation';
import {
  actorId,
  branchId,
  runId,
  fileId,
  roomTypes,
  preview,
} from '../../test/unit/inventory-import.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  executeInventoryImport: vi.fn(),
  readInventoryImport: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./private-file-input', () => ({
  PrivateFileInput: ({
    onReady,
    disabled,
    purpose,
  }: {
    onReady: (id: string) => void;
    disabled: boolean;
    purpose: string;
  }) => (
    <button disabled={disabled} onClick={() => onReady(fileId)}>
      Choose clean {purpose} CSV
    </button>
  ),
}));
const caches: QueryClient[] = [];
let current = preview;
beforeEach(() => {
  current = preview;
  vi.mocked(readInventoryImport)
    .mockReset()
    .mockImplementation(async () => current);
  vi.mocked(executeInventoryImport)
    .mockReset()
    .mockImplementation(async (_client, _branch, command) => {
      if (command.kind === 'commit')
        current = { ...preview, status: 'committed', committedAt: preview.createdAt };
      return { id: runId, branchId };
    });
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function mount() {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  caches.push(cache);
  const tree = (unavailable = false) => (
    <QueryClientProvider client={cache}>
      <InventoryNavigationProvider>
        <InventoryImport
          actorId={actorId}
          branchId={branchId}
          roomTypes={roomTypes}
          unavailable={unavailable}
          blocked={false}
        />
      </InventoryNavigationProvider>
    </QueryClientProvider>
  );
  return { cache, tree, ...render(tree()) };
}
function choose() {
  fireEvent.click(screen.getByRole('button', { name: 'Import inventory CSV' }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose clean import CSV' }));
}
it('PROP-001: actual import panel validates checked source, shows records, then commits all and refreshes inventory', async () => {
  const { cache } = mount(),
    invalidate = vi.spyOn(cache, 'invalidateQueries');
  choose();
  fireEvent.click(screen.getByRole('button', { name: 'Validate CSV' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Commit all 2 records' }));
  await screen.findByText('All records committed. Imported inventory is inactive.');
  expect(vi.mocked(executeInventoryImport).mock.calls.map((call) => call.slice(1, 3))).toEqual([
    [branchId, { kind: 'validate', body: { kind: 'rooms', fileId } }],
    [branchId, { kind: 'commit', runId }],
  ]);
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['branch-inventory-pages', actorId, branchId],
  });
});
it('PROP-001: unknown result locks source/kind/close and retries the original key/body', async () => {
  vi.mocked(executeInventoryImport).mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'));
  mount();
  choose();
  fireEvent.click(screen.getByRole('button', { name: 'Validate CSV' }));
  await screen.findByRole('button', { name: 'Retry original import command' });
  expect(screen.getByLabelText('Import kind')).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Close CSV import' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry original import command' }));
  await screen.findByRole('button', { name: 'Commit all 2 records' });
  expect(vi.mocked(executeInventoryImport).mock.calls[1]).toEqual(
    vi.mocked(executeInventoryImport).mock.calls[0],
  );
});
it('PROP-001 / ACC-004: invalid rows block commit and parent access loss hides every cached CSV record', async () => {
  current = {
    ...preview,
    status: 'failed',
    errorRows: 1,
    rows: preview.rows.map((row, index) => ({ ...row, errors: index ? [] : ['INVALID_VALUE'] })),
  };
  const view = mount();
  choose();
  fireEvent.click(screen.getByRole('button', { name: 'Validate CSV' }));
  await screen.findByText('Correct the CSV errors and upload a new file. Nothing was imported.');
  expect(screen.queryByRole('button', { name: 'Commit all 2 records' })).toBeNull();
  await view.rerender(view.tree(true));
  await waitFor(() => expect(screen.queryByText(/Record 2: room 201/)).toBeNull());
});
it('PROP-001: preview pagination sends exact private run offsets and restores the first records', async () => {
  vi.mocked(readInventoryImport).mockImplementation(async (_client, _branch, _run, query) => {
    const offset =
      query && typeof query === 'object' && 'offset' in query ? Number(query.offset) : 0;
    return {
      ...preview,
      totalRows: 51,
      rows: Array.from({ length: offset ? 1 : 50 }, (_, index) => ({
        ...preview.rows[0],
        recordNumber: offset + index + 2,
        roomTypeId: preview.rows[0]?.roomTypeId ?? null,
        roomNumber: String(201 + offset + index),
        bedLabel: null,
        errors: [],
      })),
      nextOffset: offset ? null : 50,
    };
  });
  mount();
  choose();
  fireEvent.click(screen.getByRole('button', { name: 'Validate CSV' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Next preview records' }));
  await screen.findByText(/Record 52: room 251/);
  expect(readInventoryImport).toHaveBeenCalledWith({}, branchId, runId, { offset: 50, limit: 50 });
  fireEvent.click(screen.getByRole('button', { name: 'First preview records' }));
  await screen.findByText(/Record 2: room 201/);
});
