/// <reference types="jest" />
jest.mock('expo-router', () => ({
  useFocusEffect: (work: () => undefined | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  readBillingCatalog,
  createBillingCatalogEntry,
  archiveBillingCatalogEntry,
} from '@hsm/api-client';
import {
  billingCatalogPageSchema,
  billingCatalogEntrySchema,
  billingCatalogInputSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { NativeBillingCatalog } from './native-billing-catalog';
import { pullToRefresh, startPullToRefresh } from '../test-utils/pull-refresh';
// The list has loaded once its loading placeholder is gone.
const loaded = () =>
  waitFor(() => expect(screen.queryByLabelText('Loading approved charges…')).toBeNull());
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => '019a1234-1234-7123-8123-' + String(++sequence).padStart(12, '0') };
});
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  readBillingCatalog: jest.fn(),
  createBillingCatalogEntry: jest.fn(),
  archiveBillingCatalogEntry: jest.fn(),
}));
const id = '10000000-0000-4000-8000-000000000001',
  next = '10000000-0000-4000-8000-000000000002';
const entry = billingCatalogEntrySchema.parse({
  id,
  branchId: id,
  code: 'laundry',
  name: 'Laundry',
  unitLabel: 'load',
  unitAmountPaisa: 1250,
  createdAt: '2026-10-20T00:00:00.000Z',
  archivedAt: null,
});
const initial = billingCatalogPageSchema.parse({
  branchId: id,
  canEdit: true,
  includeArchived: false,
  data: [entry],
  nextCursor: null,
});
let current = initial,
  cache: QueryClient;
beforeEach(() => {
  jest.resetAllMocks();
  current = initial;
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const runtime = jest.requireMock<{ actorClient: jest.Mock }>('../lib/runtime');
  runtime.actorClient.mockResolvedValue({});
  jest.mocked(readBillingCatalog).mockImplementation(async () => current);
  jest.mocked(createBillingCatalogEntry).mockImplementation(async (_client, _branch, body) => {
    const value = billingCatalogInputSchema.parse(body);
    const saved = billingCatalogEntrySchema.parse({ ...entry, ...value, id: next });
    current = billingCatalogPageSchema.parse({ ...current, data: [entry, saved] });
    return saved;
  });
  jest.mocked(archiveBillingCatalogEntry).mockImplementation(async () => {
    const saved = { ...entry, archivedAt: '2026-10-20T01:00:00.000Z' };
    current = billingCatalogPageSchema.parse({
      ...current,
      data: current.includeArchived ? [saved] : [],
    });
    return saved;
  });
});
afterEach(async () => {
  await act(async () => {
    cache.clear();
  });
});
function tree(actor = id, branch = id, unavailable = false) {
  return (
    <QueryClientProvider client={cache}>
      <NativeBillingCatalog actorId={actor} branchId={branch} accessUnavailable={unavailable} />
    </QueryClientProvider>
  );
}
async function open() {
  await render(tree());
  await fireEvent.press(screen.getByRole('button', { name: 'Approved charges' }));
  await loaded();
}
async function fill(price = '12.50') {
  for (const [label, value] of [
    ['Charge code', 'ironing'],
    ['Charge name', 'Ironing'],
    ['Charge unit', 'item'],
    ['Unit price (PKR)', price],
  ]) {
    if (!label || !value) throw Error('Expected field fixture');
    await fireEvent.changeText(screen.getByLabelText(label), value);
  }
}
it('FIN-004 / ACC-004: native catalogue is lazy, actor-bound and Manager read only without raw IDs', async () => {
  current = { ...initial, canEdit: false };
  await render(tree());
  expect(readBillingCatalog).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Approved charges' }));
  await screen.findByText('Laundry');
  expect(screen.getByText('PKR 12.50 per load')).toBeDefined();
  expect(actorClient).toHaveBeenCalledWith(id);
  expect(readBillingCatalog).toHaveBeenCalledWith({}, id, { limit: 20, includeArchived: 'false' });
  expect(screen.queryByText(new RegExp(id))).toBeNull();
  expect(screen.queryByLabelText('Charge code')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archive Laundry' })).toBeNull();
});
it('FIN-004: unsupported precision and zero unit prices fail before any SDK write', async () => {
  await open();
  await fill('1.001');
  await fireEvent.press(screen.getByRole('button', { name: 'Create approved charge' }));
  await screen.findByRole('alert');
  expect(createBillingCatalogEntry).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Unit price (PKR)'), '0');
  await fireEvent.press(screen.getByRole('button', { name: 'Create approved charge' }));
  expect(createBillingCatalogEntry).not.toHaveBeenCalled();
});
it('FIN-004: matching persisted create uses exact paisa and refreshes actual names', async () => {
  await open();
  await fill();
  await fireEvent.press(screen.getByRole('button', { name: 'Create approved charge' }));
  await screen.findByText('Approved charge created.');
  await screen.findByText('Ironing');
  expect(createBillingCatalogEntry).toHaveBeenCalledWith(
    {},
    id,
    { code: 'ironing', name: 'Ironing', unitLabel: 'item', unitAmountPaisa: 1250 },
    expect.any(String),
  );
});
it('FIN-004 / AUD-004: failed identical create retains entered values and its command key', async () => {
  jest
    .mocked(createBillingCatalogEntry)
    .mockRejectedValueOnce(new Error('private provider secret'));
  await open();
  await fill();
  await fireEvent.press(screen.getByRole('button', { name: 'Create approved charge' }));
  await screen.findAllByRole('alert');
  expect(screen.queryByText(/private provider secret/)).toBeNull();
  expect(screen.queryByText('Approved charge created.')).toBeNull();
  await pullToRefresh(cache);
  await loaded();
  expect(screen.getByLabelText('Charge name').props.value).toBe('Ironing');
  await fireEvent.press(screen.getByRole('button', { name: 'Create approved charge' }));
  await screen.findByText('Approved charge created.');
  const firstKey = jest.mocked(createBillingCatalogEntry).mock.calls[0]?.[3];
  expect(stayIdentifierSchema.parse(firstKey)).toBe(firstKey);
  expect(jest.mocked(createBillingCatalogEntry).mock.calls[1]?.[3]).toBe(firstKey);
});
it('AUD-004: archive requires a reason, retains the immutable price and can be cancelled', async () => {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Archive Laundry' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm archive approved charge' }));
  await screen.findByText('Enter a reason before archiving this charge.');
  expect(archiveBillingCatalogEntry).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Archival reason'), '  Retired service  ');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel charge archive' }));
  expect(archiveBillingCatalogEntry).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Archive Laundry' }));
  await fireEvent.changeText(screen.getByLabelText('Archival reason'), ' Retired service ');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm archive approved charge' }));
  await screen.findByText('Approved charge archived.');
  expect(archiveBillingCatalogEntry).toHaveBeenCalledWith(
    {},
    { branchId: id, catalogId: id },
    { reason: 'Retired service' },
    expect.any(String),
  );
});
it('SEC-003: parent access loss and account switch hide the old private catalogue and discard drafts', async () => {
  const mounted = await render(tree());
  await fireEvent.press(screen.getByRole('button', { name: 'Approved charges' }));
  await screen.findByText('Laundry');
  await fill();
  await mounted.rerender(tree(id, id, true));
  expect(screen.queryByText('Laundry')).toBeNull();
  expect(screen.queryByLabelText('Charge name')).toBeNull();
  await mounted.rerender(tree(next, id));
  expect(screen.queryByText('Laundry')).toBeNull();
  expect(screen.queryByLabelText('Charge name')).toBeNull();
  expect(screen.getByRole('button', { name: 'Approved charges' })).toBeDefined();
  expect(readBillingCatalog).toHaveBeenCalledTimes(1);
});
it('FIN-004: history and continuation send only the selected bounded cursor and view', async () => {
  jest.mocked(readBillingCatalog).mockImplementation(async (_client, _branch, input) => {
    const history =
      typeof input === 'object' &&
      input !== null &&
      Reflect.get(input, 'includeArchived') === 'true';
    const cursor = typeof input === 'object' && input !== null && Reflect.get(input, 'cursor');
    return {
      ...initial,
      includeArchived: history,
      data: cursor ? [] : [entry],
      nextCursor: cursor ? null : id,
    };
  });
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Next approved charges page' }));
  await screen.findByText('No approved charges on this page.');
  expect(readBillingCatalog).toHaveBeenLastCalledWith({}, id, {
    limit: 20,
    cursor: id,
    includeArchived: 'false',
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Include archived charges' }));
  await screen.findByText('Laundry');
  expect(readBillingCatalog).toHaveBeenLastCalledWith({}, id, {
    limit: 20,
    includeArchived: 'true',
  });
});
it('SEC-003: pending and failed refresh hide cached prices until successful recovery, retaining the draft', async () => {
  await open();
  await fill();
  let reject: ((reason: Error) => void) | undefined;
  jest.mocked(readBillingCatalog).mockImplementationOnce(
    () =>
      new Promise((_resolve, rejectRead) => {
        reject = rejectRead;
      }),
  );
  await startPullToRefresh(cache);
  await screen.findByLabelText('Loading approved charges…');
  expect(screen.queryByText('Laundry')).toBeNull();
  expect(screen.queryByLabelText('Charge name')).toBeNull();
  await act(async () => {
    if (!reject) throw Error('Expected pending catalogue read');
    reject(new Error('private refresh details'));
  });
  await screen.findAllByRole('alert');
  expect(screen.queryByText(/private refresh details/)).toBeNull();
  await pullToRefresh(cache);
  await screen.findByText('Laundry');
  expect(screen.getByLabelText('Charge name').props.value).toBe('Ironing');
});
it('SEC-003: an account-bound client failure cannot issue a private catalogue request', async () => {
  jest.mocked(actorClient).mockRejectedValueOnce(new Error('Account changed'));
  await render(tree());
  await fireEvent.press(screen.getByRole('button', { name: 'Approved charges' }));
  await screen.findAllByRole('alert');
  expect(readBillingCatalog).not.toHaveBeenCalled();
  expect(screen.queryByText('Laundry')).toBeNull();
});
it('FIN-004: closing discards unsaved native inputs without a financial command', async () => {
  await open();
  await fill();
  await fireEvent.press(screen.getByRole('button', { name: 'Close approved charges' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Approved charges' }));
  await loaded();
  expect(screen.getByLabelText('Charge name').props.value).toBe('');
  expect(createBillingCatalogEntry).not.toHaveBeenCalled();
  expect(archiveBillingCatalogEntry).not.toHaveBeenCalled();
  await waitFor(() => expect(readBillingCatalog).toHaveBeenCalledTimes(2));
});

it('FIN-004 / SEC-003: pending create is disabled without success and late old-account completion cannot reopen private state', async () => {
  let finish: ((value: typeof entry) => void) | undefined;
  jest.mocked(createBillingCatalogEntry).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const mounted = await render(tree());
  await fireEvent.press(screen.getByRole('button', { name: 'Approved charges' }));
  await screen.findByText('Laundry');
  await fill();
  await fireEvent.press(screen.getByRole('button', { name: 'Create approved charge' }));
  await waitFor(() => expect(createBillingCatalogEntry).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('Approved charge created.')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Create approved charge' }).props.accessibilityState
      .disabled,
  ).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Create approved charge' }));
  expect(createBillingCatalogEntry).toHaveBeenCalledTimes(1);
  await mounted.rerender(tree(next));
  await act(async () => {
    if (!finish) throw Error('Expected pending catalogue create');
    finish({ ...entry, id: next, code: 'ironing', name: 'Ironing', unitLabel: 'item' });
  });
  expect(screen.queryByText('Approved charge created.')).toBeNull();
  expect(screen.queryByText('Laundry')).toBeNull();
  expect(screen.getByRole('button', { name: 'Approved charges' })).toBeDefined();
});
it('MGRD: on its own Manager tool screen the catalogue opens at once with no second Back', async () => {
  current = { ...initial, canEdit: false };
  await render(
    <QueryClientProvider client={cache}>
      <NativeBillingCatalog actorId={id} branchId={id} standalone />
    </QueryClientProvider>,
  );
  await screen.findByText('Laundry');
  expect(screen.queryByRole('button', { name: 'Approved charges' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Close approved charges' })).toBeNull();
  expect(screen.getByText('View only · the Owner edits charges')).toBeTruthy();
});
