import { useAdmissionAccess } from '../lib/use-admission-access';
import { useState, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readInventoryAccess, readBillingSettings, readBillingCatalog } from '@hsm/api-client';
import {
  billingSettingsReadSchema,
  billingCatalogEntrySchema,
  type InventoryAccess,
} from '@hsm/contracts';
import { AdmissionInventoryHost } from './admission-inventory-host';
import { admissionUiManual } from './admission-ui.fixture';
import {
  inventory,
  typeId,
  branchId,
  actorId,
  roomId,
  seatId,
} from '../../test/unit/inventory-pages.fixture';
const observed = vi.hoisted(() => ({ workflow: vi.fn(), observeAccess: false }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readInventoryAccess: vi.fn(),
  readBillingSettings: vi.fn(),
  readBillingCatalog: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./admission-workflow', () => ({
  AdmissionWorkflow: (
    props: ComponentProps<typeof import('./admission-workflow').AdmissionWorkflow>,
  ) => {
    observed.workflow(props);
    const [instance] = useState(() => crypto.randomUUID());
    return (
      <div>
        <span data-testid="admission-instance">{instance}</span>
        {props.navigation}
        {observed.observeAccess ? <SharedAccessObserver {...props} /> : null}
      </div>
    );
  },
}));
function SharedAccessObserver(
  props: ComponentProps<typeof import('./admission-workflow').AdmissionWorkflow>,
) {
  const { allowed } = useAdmissionAccess(props.actorId, props.branchId, props.unavailable);
  return <span data-testid="shared-access">{allowed ? 'Ready' : 'Pending'}</span>;
}
type Props = ComponentProps<typeof AdmissionInventoryHost>;
const caches: QueryClient[] = [];
const permissions: InventoryAccess['permissions'] = ['stay_manage', 'rent_manage', 'finance_view'];
const entry = billingCatalogEntrySchema.parse({
  id: seatId,
  branchId,
  code: 'laundry',
  name: 'Laundry',
  unitLabel: 'wash',
  unitAmountPaisa: 101,
  archivedAt: null,
  createdAt: '2028-01-01T00:00:00.000Z',
});
const settings = billingSettingsReadSchema.parse({
  target: { branchId, roomTypeId: typeId },
  canEdit: false,
  localVersion: null,
  effectiveVersion: {
    id: typeId,
    level: 'branch',
    scopeId: branchId,
    createdAt: '2028-01-01T00:00:00.000Z',
    policy: { ...admissionUiManual().terms.policy, customCharges: 'catalog_only' },
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  observed.observeAccess = false;
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions,
    canConfigureManagers: false,
  });
  vi.mocked(readBillingSettings).mockResolvedValue(settings);
  vi.mocked(readBillingCatalog).mockResolvedValue({
    branchId,
    canEdit: false,
    includeArchived: false,
    data: [entry],
    nextCursor: null,
  });
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function fixture() {
  const props: Props = {
    actorId,
    branchId,
    branchLabel: 'Named branch',
    blocked: false,
    state: {
      query: {
        data: inventory,
        error: null,
        isError: false,
        isPending: false,
        isFetching: false,
        refetch: vi.fn(async () => ({ isError: false })),
      },
      paging: {
        typeCursor: undefined,
        roomCursor: undefined,
        bedCursor: undefined,
        selectedTypeId: typeId,
        selectedRoomId: roomId,
        nextTypeCursor: typeId,
        nextRoomCursor: roomId,
        nextBedCursor: seatId,
        selectType: vi.fn(),
        selectRoom: vi.fn(),
        firstTypes: vi.fn(),
        nextTypes: vi.fn(),
        firstRooms: vi.fn(),
        nextRooms: vi.fn(),
        firstBeds: vi.fn(),
        nextBeds: vi.fn(),
      },
    },
  };
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  caches.push(cache);
  const tree = (value = props) => (
    <QueryClientProvider client={cache}>
      <AdmissionInventoryHost {...value} />
    </QueryClientProvider>
  );
  return { props, cache, tree, ...render(tree()) };
}
async function open() {
  fireEvent.click(await screen.findByRole('button', { name: 'Admit resident' }));
  await screen.findByTestId('admission-instance');
}
function latest() {
  const call: unknown = observed.workflow.mock.lastCall?.[0];
  if (!call || typeof call !== 'object') throw Error('Workflow props missing');
  return call;
}
it('STAY-001 / FIN-004: actual host reads no private billing metadata before explicit admission opening', async () => {
  fixture();
  await screen.findByRole('button', { name: 'Admit resident' });
  expect(readBillingSettings).not.toHaveBeenCalled();
  expect(readBillingCatalog).not.toHaveBeenCalled();
  expect(observed.workflow).not.toHaveBeenCalled();
});
it.each(['stay_manage', 'rent_manage', 'finance_view'] as const)(
  'SEC-003: missing %s keeps the entry inactive and metadata private',
  async (grant) => {
    vi.mocked(readInventoryAccess).mockResolvedValue({
      branchId,
      permissions: permissions.filter((item) => item !== grant),
      canConfigureManagers: false,
    });
    const f = fixture();
    await waitFor(() =>
      expect(f.cache.getQueryState(['inventory-access', actorId, branchId])?.status).toBe(
        'success',
      ),
    );
    expect(screen.queryByRole('button', { name: 'Admit resident' })).toBeNull();
    expect(readBillingSettings).not.toHaveBeenCalled();
  },
);
it('STAY-001 / FIN-004: current named inventory and exact room-type policy are passed to the connected workflow', async () => {
  const f = fixture();
  await open();
  expect(readBillingSettings).toHaveBeenCalledWith({}, { branchId, roomTypeId: typeId });
  expect(readBillingCatalog).toHaveBeenCalledWith({}, branchId, {
    limit: 20,
    includeArchived: 'false',
  });
  expect(latest()).toMatchObject({
    actorId,
    branchId,
    branchLabel: 'Named branch',
    roomType: inventory.roomTypes[0],
    rooms: inventory.rooms,
    settings,
    catalog: [entry],
    pending: false,
    unavailable: false,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next admission rooms page' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next admission beds page' }));
  expect(f.props.state.paging.nextRooms).toHaveBeenCalledTimes(1);
  expect(f.props.state.paging.nextBeds).toHaveBeenCalledTimes(1);
  expect(latest()).toHaveProperty('onRoom', f.props.state.paging.selectRoom);
});
it('FIN-004 / ACC-004: explicitly loading another charge page appends named choices without remounting the command', async () => {
  vi.mocked(readBillingCatalog)
    .mockResolvedValueOnce({
      branchId,
      canEdit: false,
      includeArchived: false,
      data: [entry],
      nextCursor: seatId,
    })
    .mockResolvedValueOnce({
      branchId,
      canEdit: false,
      includeArchived: false,
      data: [{ ...entry, id: roomId, code: 'ironing', name: 'Ironing' }],
      nextCursor: null,
    });
  fixture();
  await open();
  const instance = screen.getByTestId('admission-instance').textContent;
  fireEvent.click(screen.getByRole('button', { name: 'Load more admission charges' }));
  await waitFor(() =>
    expect(latest()).toHaveProperty('catalog', [
      entry,
      { ...entry, id: roomId, code: 'ironing', name: 'Ironing' },
    ]),
  );
  expect(readBillingCatalog).toHaveBeenLastCalledWith({}, branchId, {
    limit: 20,
    includeArchived: 'false',
    cursor: seatId,
  });
  expect(screen.getByTestId('admission-instance').textContent).toBe(instance);
});
it('ACC-004: paginated inventory loading disables the workflow while preserving its command instance', async () => {
  const f = fixture();
  await open();
  const instance = screen.getByTestId('admission-instance').textContent;
  f.rerender(
    f.tree({
      ...f.props,
      state: {
        ...f.props.state,
        query: { ...f.props.state.query, data: undefined, isFetching: true, isPending: true },
      },
    }),
  );
  expect(latest()).toMatchObject({ pending: true, unavailable: false });
  expect(screen.getByTestId('admission-instance').textContent).toBe(instance);
  f.rerender(f.tree());
  await waitFor(() => expect(latest()).toMatchObject({ pending: false, unavailable: false }));
  expect(screen.getByTestId('admission-instance').textContent).toBe(instance);
});
it('SEC-003 / ACC-004: blocked access hides private editing without dropping an unresolved mounted command', async () => {
  const f = fixture();
  await open();
  const instance = screen.getByTestId('admission-instance').textContent;
  f.rerender(f.tree({ ...f.props, blocked: true }));
  expect(latest()).toMatchObject({ pending: true, unavailable: true });
  expect(screen.getByTestId('admission-instance').textContent).toBe(instance);
});
it('SEC-003: account-scope change discards the old private workflow instead of reusing its draft', async () => {
  const f = fixture();
  await open();
  f.rerender(f.tree({ ...f.props, actorId: roomId }));
  expect(screen.queryByTestId('admission-instance')).toBeNull();
  await screen.findByRole('button', { name: 'Admit resident' });
  expect(readBillingSettings).toHaveBeenCalledTimes(1);
});

it('ACC-004 / SEC-003: access revalidation pauses editing without disabling the shared observer; confirmed revocation still denies', async () => {
  const f = fixture();
  await open();
  const instance = screen.getByTestId('admission-instance').textContent;
  let resolveAccess: (value: InventoryAccess) => void = () => {
    throw Error('Access resolver missing');
  };
  const response = new Promise<InventoryAccess>((resolve) => {
    resolveAccess = resolve;
  });
  vi.mocked(readInventoryAccess).mockReturnValueOnce(response);
  await act(async () => {
    void f.cache.invalidateQueries({
      queryKey: ['inventory-access', actorId, branchId],
      exact: true,
    });
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(f.cache.getQueryState(['inventory-access', actorId, branchId])?.fetchStatus).toBe(
      'fetching',
    ),
  );
  try {
    expect(latest()).toMatchObject({ pending: true, unavailable: false });
    expect(screen.getByTestId('admission-instance').textContent).toBe(instance);
  } finally {
    await act(async () =>
      resolveAccess({
        branchId,
        permissions: ['stay_manage', 'rent_manage'],
        canConfigureManagers: false,
      }),
    );
  }
  await waitFor(() => expect(latest()).toMatchObject({ pending: true, unavailable: true }));
  expect(screen.getByTestId('admission-instance').textContent).toBe(instance);
});
it('ACC-004 / SEC-003: mounting the real shared access observer settles without an enable-refetch loop', async () => {
  observed.observeAccess = true;
  fixture();
  await open();
  await waitFor(() => {
    expect(screen.getByTestId('shared-access').textContent).toBe('Ready');
    expect(latest()).toMatchObject({ pending: false, unavailable: false });
  });
  expect(readInventoryAccess).toHaveBeenCalledTimes(2);
});
