import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientFailure, executeInventoryImport, readInventoryImport } from '@hsm/api-client';
import { NativeInventoryImport } from './inventory-import';
import { NativeInventoryNavigationProvider } from './native-inventory-navigation';
import {
  actorId,
  branchId,
  runId,
  fileId,
  roomTypes,
  preview,
} from '../../test/unit/inventory-import.fixture';
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  executeInventoryImport: jest.fn(),
  readInventoryImport: jest.fn(),
}));
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000006' }));
jest.mock('./private-file-picker', () => ({
  PrivateFilePicker: ({
    onReady,
    disabled,
  }: {
    onReady: (id: string) => void;
    disabled: boolean;
  }) => {
    const { Button: NativeButton } =
      jest.requireActual<typeof import('react-native')>('react-native');
    const source = jest.requireActual<{ fileId: string }>(
      '../../test/unit/inventory-import.fixture',
    );
    return (
      <NativeButton
        disabled={disabled}
        onPress={() => onReady(source.fileId)}
        title="Choose clean CSV"
      />
    );
  },
}));
const caches: QueryClient[] = [];
let current = preview;
beforeEach(() => {
  current = preview;
  jest
    .mocked(readInventoryImport)
    .mockReset()
    .mockImplementation(async () => current);
  jest
    .mocked(executeInventoryImport)
    .mockReset()
    .mockImplementation(async (_client, _branch, command) => {
      if (command.kind === 'commit')
        current = { ...preview, status: 'committed', committedAt: preview.createdAt };
      return { id: runId, branchId };
    });
});
afterEach(async () => {
  await cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
async function mount() {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  caches.push(cache);
  const tree = (unavailable = false) => (
    <QueryClientProvider client={cache}>
      <NativeInventoryNavigationProvider>
        <NativeInventoryImport
          actorId={actorId}
          branchId={branchId}
          roomTypes={roomTypes}
          unavailable={unavailable}
          blocked={false}
        />
      </NativeInventoryNavigationProvider>
    </QueryClientProvider>
  );
  return { cache, tree, ...(await render(tree())) };
}
async function choose() {
  await fireEvent.press(screen.getByRole('button', { name: 'Import inventory CSV' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Choose clean CSV' }));
}
it('PROP-001: native import validates a checked file, previews all records and explicitly commits', async () => {
  const { cache } = await mount(),
    invalidate = jest.spyOn(cache, 'invalidateQueries');
  await choose();
  await fireEvent.press(screen.getByRole('button', { name: 'Validate CSV' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Commit all 2 records' }));
  await screen.findByText('All records committed. Imported inventory is inactive.');
  expect(jest.mocked(executeInventoryImport).mock.calls.map((call) => call.slice(1, 3))).toEqual([
    [branchId, { kind: 'validate', body: { kind: 'rooms', fileId } }],
    [branchId, { kind: 'commit', runId }],
  ]);
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['branch-inventory-pages', actorId, branchId],
  });
});
it('PROP-001: uncertain native import freezes replacement and retries exact original source/key', async () => {
  jest
    .mocked(executeInventoryImport)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'));
  await mount();
  await choose();
  await fireEvent.press(screen.getByRole('button', { name: 'Validate CSV' }));
  await screen.findByRole('button', { name: 'Retry original import command' });
  expect(screen.getByRole('button', { name: 'Close CSV import' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry original import command' }));
  await screen.findByRole('button', { name: 'Commit all 2 records' });
  expect(jest.mocked(executeInventoryImport).mock.calls[1]).toEqual(
    jest.mocked(executeInventoryImport).mock.calls[0],
  );
});
it('PROP-001 / ACC-004: failed rows cannot commit and stale parent access hides private preview facts', async () => {
  current = {
    ...preview,
    status: 'failed',
    errorRows: 1,
    rows: preview.rows.map((row, index) => ({ ...row, errors: index ? [] : ['INVALID_VALUE'] })),
  };
  const view = await mount();
  await choose();
  await fireEvent.press(screen.getByRole('button', { name: 'Validate CSV' }));
  await screen.findByText('Correct the CSV errors and upload a new file. Nothing was imported.');
  expect(screen.queryByRole('button', { name: 'Commit all 2 records' })).toBeNull();
  await view.rerender(view.tree(true));
  await waitFor(() => expect(screen.queryByText(/Record 2: room 201/)).toBeNull());
});
it('PROP-001: native private preview pages keep the exact run and record offset', async () => {
  jest.mocked(readInventoryImport).mockImplementation(async (_client, _branch, _run, query) => {
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
  await mount();
  await choose();
  await fireEvent.press(screen.getByRole('button', { name: 'Validate CSV' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Next preview records' }));
  await screen.findByText(/Record 52: room 251/);
  expect(readInventoryImport).toHaveBeenCalledWith({}, branchId, runId, { offset: 50, limit: 50 });
  await fireEvent.press(screen.getByRole('button', { name: 'First preview records' }));
  await screen.findByText(/Record 2: room 201/);
});
