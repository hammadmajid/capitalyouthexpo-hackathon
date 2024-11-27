/// <reference types="jest" />
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as sdk from '@hsm/api-client';
import type { TransportRoute } from '@hsm/contracts';
import { TransportWorkspace } from './transport-workspace';
import { TransportSetup } from './transport-setup';
import { TransportBillingPolicyForm } from './transport-billing-policy';
import { ResidentTransport } from './resident-transport';
import { formatDays, priceLabel, tripParts } from './transport-ui';
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  // The route editor's header listens for the hardware Back button while focused.
  useFocusEffect: (work: () => undefined | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
}));
jest.mock('../../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readBranchRoutes: jest.fn(),
  readBillingSettings: jest.fn(),
  saveTransportBillingPolicy: jest.fn(),
  readInventoryAccess: jest.fn(),
  readTransportOverview: jest.fn(),
  createTransportRoute: jest.fn(),
  updateTransportRoute: jest.fn(),
  readBranchTransport: jest.fn(),
  decideTransport: jest.fn(),
  readStayRoutes: jest.fn(),
  readStayTransport: jest.fn(),
  requestTransport: jest.fn(),
  residentTransportAction: jest.fn(),
  marketplaceInstitutions: jest.fn(),
}));
const branch = '10000000-0000-4000-8000-000000000001',
  stay = '10000000-0000-4000-8000-000000000002',
  routeId = '10000000-0000-4000-8000-000000000003';
const trip = {
  days: [1, 2, 3, 4, 5],
  outboundDeparts: '07:30',
  outboundArrives: '08:00',
  outboundArrivesNextDay: false,
  returnDeparts: '16:00',
  returnDepartsNextDay: false,
  returnArrives: null,
  returnArrivesNextDay: false,
  effectiveFrom: '2026-07-01',
  active: true,
};
const route: TransportRoute = {
  id: routeId,
  branchId: branch,
  name: 'University route',
  description: null,
  monthlyChargePaisa: 400000,
  departureTimes: ['07:30'],
  stops: ['Gate'],
  status: 'active',
  version: 1,
  pricingMode: 'separate',
  includedFrom: null,
  destinations: [{ kind: 'university', name: 'Catalog University', placeId: null, areaId: null }],
  stopPoints: [{ name: 'Gate', role: 'pickup' }],
  trips: [trip],
};
const billing = {
  id: routeId,
  level: 'branch' as const,
  scopeId: branch,
  createdAt: '2026-11-16T00:00:00.000Z',
  policy: {
    cycle: { kind: 'calendar_month' as const, dueDay: 5 },
    proration: { kind: 'full_period' as const },
    graceDays: 0,
    lateCharge: { kind: 'disabled' as const },
    noticeDays: 0,
    earlyCheckout: { kind: 'full_period' as const },
    allowOpenEnded: true,
    customCharges: 'disabled' as const,
  },
};
const monthlySubscription = {
  monthlyChargePaisa: 300000,
  dueDay: 10,
  refundable: true,
  proration: { kind: 'calendar_days' as const, rounding: 'half_up' as const },
};

async function show(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(sdk.readInventoryAccess).mockResolvedValue({
    branchId: branch,
    permissions: ['listing_edit', 'pricing_edit', 'finance_view', 'stay_manage', 'rent_manage'],
    canConfigureManagers: true,
  });
  jest.mocked(sdk.readBranchRoutes).mockResolvedValue({ branchId: branch, data: [route] });
  jest.mocked(sdk.readBillingSettings).mockResolvedValue({
    target: { branchId: branch },
    canEdit: true,
    canEditTransport: true,
    localVersion: billing,
    effectiveVersion: billing,
  });
  jest.mocked(sdk.saveTransportBillingPolicy).mockResolvedValue(billing);
  jest.mocked(sdk.readTransportOverview).mockResolvedValue({
    branchId: branch,
    activeRoutes: 1,
    inactiveRoutes: 0,
    destinations: 1,
    includedRoutes: 0,
    paidRoutes: 1,
    activeSubscribers: 3,
    pendingRequests: 1,
    monthlyChargesPaisa: 1200000,
    tripsToday: 2,
  });
  jest.mocked(sdk.createTransportRoute).mockResolvedValue(route);
  jest.mocked(sdk.readBranchTransport).mockResolvedValue({ data: [], nextCursor: null });
  jest
    .mocked(sdk.marketplaceInstitutions)
    .mockResolvedValue({ data: [], nextCursor: null } as never);
});
it('CHG-042: days, trips and prices read plainly', () => {
  expect(formatDays([1, 2, 3, 4, 5])).toBe('Mon–Fri');
  expect(formatDays([1, 3])).toBe('Mon, Wed');
  expect(formatDays([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
  expect(tripParts(trip)).toEqual({ out: '7:30 AM – 8:00 AM', back: '4:00 PM' });
  expect(tripParts({ ...trip, returnDeparts: null }).back).toBeNull();
  expect(
    tripParts({
      ...trip,
      outboundDeparts: '22:00',
      outboundArrives: '00:30',
      outboundArrivesNextDay: true,
    }).out,
  ).toBe('10:00 PM – 12:30 AM (next day)');
  expect(priceLabel({ pricingMode: 'included', monthlyChargePaisa: 0 })).toBe('Included in rent');
  expect(priceLabel(route)).toBe('PKR 4,000/month');
});
it('UI-001: accounts without subscriber access see no route or financial controls', async () => {
  jest.mocked(sdk.readInventoryAccess).mockResolvedValue({
    branchId: branch,
    permissions: ['listing_edit'],
    canConfigureManagers: false,
  });
  await show(<TransportWorkspace actorId="manager" branchId={branch} />);
  expect(
    await screen.findByText('Transport subscribers are unavailable for this account.'),
  ).toBeTruthy();
  expect(sdk.readBranchRoutes).not.toHaveBeenCalled();
  expect(sdk.readBranchTransport).not.toHaveBeenCalled();
  expect(screen.queryByText('Monthly transport fees')).toBeNull();
});
it('UI-001: Operations shows subscribers and transport-only monthly total; routes stay in setup', async () => {
  await show(<TransportWorkspace actorId="u" branchId={branch} />);
  expect(await screen.findByRole('button', { name: 'Transport subscribers: 3' })).toBeTruthy();
  expect(screen.getByLabelText('Monthly transport fees: PKR 12,000')).toBeTruthy();
  expect(screen.queryByText('Trips today')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Routes' })).toBeNull();
  expect(sdk.readBranchRoutes).not.toHaveBeenCalled();
  await show(<TransportSetup actorId="u" branchId={branch} />);
  expect((await screen.findByLabelText('Transport available')).props.value).toBe(true);
  expect(screen.getByText('Catalog University')).toBeTruthy();
});
it('CHG-049: adding a place saves it straight away with no times, stops or description', async () => {
  jest.mocked(sdk.readBranchRoutes).mockResolvedValue({ branchId: branch, data: [] });
  await show(<TransportSetup actorId="u" branchId={branch} />);
  // Off until switched on; switching on opens the place list.
  const toggle = await screen.findByLabelText('Transport available');
  expect(toggle.props.value).toBe(false);
  expect(screen.queryByLabelText('Add a destination')).toBeNull();
  await fireEvent(toggle, 'valueChange', true);
  expect(sdk.createTransportRoute).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Route name')).toBeNull();
  expect(screen.queryByText(/Times|Pick-up|Description/)).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Add a destination'), 'Comsats');
  await fireEvent.press(await screen.findByRole('button', { name: 'Add Comsats' }));
  await waitFor(() => expect(sdk.createTransportRoute).toHaveBeenCalled());
  expect(jest.mocked(sdk.createTransportRoute).mock.calls[0]?.[2]).toMatchObject({
    name: 'Transport',
    status: 'active',
    destinations: [{ kind: 'other', name: 'Comsats', placeId: null, areaId: null }],
    stopPoints: [],
    trips: [],
  });
  expect(screen.queryByRole('button', { name: 'Included in rent' })).toBeNull();
});
it('CHG-049: switching transport off hides it but keeps the places', async () => {
  jest.mocked(sdk.updateTransportRoute).mockResolvedValue({ ...route, status: 'inactive' });
  await show(<TransportSetup actorId="u" branchId={branch} />);
  await fireEvent(await screen.findByLabelText('Transport available'), 'valueChange', false);
  await waitFor(() => expect(sdk.updateTransportRoute).toHaveBeenCalled());
  expect(jest.mocked(sdk.updateTransportRoute).mock.calls[0]?.[3]).toMatchObject({
    status: 'inactive',
    destinations: route.destinations,
  });
  expect(screen.queryByText('Catalog University')).toBeNull();
});
it('CHG-049: removing the last place hides transport and clears old times and stops', async () => {
  jest.mocked(sdk.updateTransportRoute).mockResolvedValue({ ...route, destinations: [] });
  await show(<TransportSetup actorId="u" branchId={branch} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove Catalog University' }));
  await waitFor(() => expect(sdk.updateTransportRoute).toHaveBeenCalled());
  expect(jest.mocked(sdk.updateTransportRoute).mock.calls[0]?.[3]).toMatchObject({
    name: 'University route',
    status: 'inactive',
    destinations: [],
    stopPoints: [],
    trips: [],
    expectedVersion: 1,
  });
});
it('CHG-047: billing selects the mode without showing subscription fields', async () => {
  await show(
    <TransportBillingPolicyForm
      actorId="u"
      branchId={branch}
      version={routeId}
      policy={{ monthlySubscription }}
      canEdit
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Edit transport billing' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Billed separately' }));
  expect(screen.queryByLabelText('Monthly transport fee in PKR')).toBeNull();
  expect(screen.queryByText('When transport covers part of a month')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Save transport billing' }));
  await waitFor(() =>
    expect(sdk.saveTransportBillingPolicy).toHaveBeenCalledWith(
      {},
      branch,
      {
        policyVersionId: routeId,
        transportBilling: {
          offer: { mode: 'separate', monthlyChargePaisa: 300000 },
          dueDay: 10,
          refundable: true,
          proration: monthlySubscription.proration,
        },
      },
      expect.any(String),
    ),
  );
});
it('CHG-047: amenities saves a monthly subscription without publishing a pricing mode', async () => {
  await show(<TransportSetup actorId="u" branchId={branch} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Add monthly subscription' }));
  await fireEvent.changeText(screen.getByLabelText('Monthly transport fee in PKR'), '3000');
  expect(screen.queryByLabelText('Transport due day')).toBeNull();
  expect(screen.getByText('Billed with rent')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Refundable' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save subscription' }));
  await waitFor(() =>
    expect(sdk.saveTransportBillingPolicy).toHaveBeenCalledWith(
      {},
      branch,
      {
        policyVersionId: routeId,
        transportBilling: { monthlySubscription: { ...monthlySubscription, dueDay: 5 } },
      },
      expect.any(String),
    ),
  );
  expect(sdk.createTransportRoute).not.toHaveBeenCalled();
});
it('CHG-042: residents see included routes as included, or as not in their agreement', async () => {
  jest.mocked(sdk.readStayRoutes).mockResolvedValue({
    branchId: branch,
    offer: { mode: 'included' },
    data: [
      {
        ...route,
        pricingMode: 'included',
        monthlyChargePaisa: 0,
        includedFrom: '2026-01-01',
        residentInclusion: 'included',
      },
      {
        ...route,
        id: stay,
        name: 'Night route',
        pricingMode: 'included',
        monthlyChargePaisa: 0,
        includedFrom: '2027-01-01',
        residentInclusion: 'not_in_agreement',
      },
    ],
  });
  jest.mocked(sdk.readStayTransport).mockResolvedValue({ data: [], nextCursor: null });
  await show(<ResidentTransport actorId="r" stayId={stay} closed={false} />);
  expect(await screen.findByText('Included in your rent')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Subscribe/ })).toBeNull();
});
it('SERV-002: Riders approves a request from a chosen start date', async () => {
  jest.mocked(sdk.readBranchTransport).mockResolvedValue({
    data: [
      {
        id: stay,
        branchId: branch,
        stayId: stay,
        routeId,
        routeName: 'University route',
        status: 'requested',
        monthlyChargePaisa: 400000,
        effectiveFrom: null,
        effectiveTo: null,
        endRequestedAt: null,
        reason: null,
        version: 1,
        createdAt: '2026-11-15T10:00:00.000Z',
      },
    ],
    nextCursor: null,
  });
  jest.mocked(sdk.decideTransport).mockResolvedValue({} as never);
  await show(<TransportWorkspace actorId="u" branchId={branch} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Requests: 1' }));
  expect(await screen.findByText('Asked to join')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Approve University route' }));
  await waitFor(() => expect(sdk.decideTransport).toHaveBeenCalled());
  expect(jest.mocked(sdk.decideTransport).mock.calls[0]?.[3]).toMatchObject({
    decision: 'approve',
    expectedVersion: 1,
    effectiveFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  });
});
it('SERV-002 / CHG-042: decision grants open Riders without invoice details', async () => {
  jest.mocked(sdk.readInventoryAccess).mockResolvedValue({
    branchId: branch,
    permissions: ['stay_manage', 'rent_manage'],
    canConfigureManagers: false,
  });
  jest.mocked(sdk.readBranchTransport).mockResolvedValue({
    data: [
      {
        id: stay,
        branchId: branch,
        stayId: stay,
        routeId,
        routeName: 'University route',
        residentName: 'Ali',
        status: 'active',
        monthlyChargePaisa: 400000,
        effectiveFrom: '2026-07-01',
        effectiveTo: null,
        endRequestedAt: null,
        reason: null,
        version: 2,
        createdAt: '2026-11-15T10:00:00.000Z',
        billing: null,
      },
    ],
    nextCursor: null,
  });
  await show(<TransportWorkspace actorId="manager" branchId={branch} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Transport subscribers: 3' }));
  expect(await screen.findByText('Ali')).toBeTruthy();
  expect(screen.queryByText('No invoice issued')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Transport invoices' })).toBeNull();
  expect(screen.queryByText('Monthly transport fees')).toBeNull();
  expect(screen.getByRole('button', { name: 'End University route' })).toBeTruthy();
});
it('CHG-042: a resident picks the paid route they ride and the request records it', async () => {
  const office = { ...route, id: stay, name: 'Office route' };
  jest.mocked(sdk.readStayRoutes).mockResolvedValue({
    branchId: branch,
    offer: { mode: 'separate', monthlyChargePaisa: 400000 },
    data: [route, office],
  });
  jest.mocked(sdk.readStayTransport).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(sdk.requestTransport).mockResolvedValue({} as never);
  await show(<ResidentTransport actorId="r" stayId={stay} closed={false} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Ride Office route' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Subscribe — PKR 4,000/month' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(sdk.requestTransport).toHaveBeenCalled());
  expect(jest.mocked(sdk.requestTransport).mock.calls[0]?.[2]).toEqual({
    monthlyChargePaisa: 400000,
    routeId: stay,
  });
});

it('UI-001: Transport operations opens requests from its card and keeps route setup out', async () => {
  await show(<TransportWorkspace actorId="u" branchId={branch} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Requests: 1' }));
  await waitFor(() =>
    expect(sdk.readBranchTransport).toHaveBeenLastCalledWith(
      {},
      branch,
      expect.objectContaining({ status: 'requested' }),
    ),
  );
  expect(screen.queryByText('Routes')).toBeNull();
  expect(screen.queryByText('Destinations')).toBeNull();
  expect(screen.queryByText('Trips today')).toBeNull();
  expect(sdk.readBranchRoutes).not.toHaveBeenCalled();
});

it('OWN-004: dashboard shortcut opens pending requests immediately', async () => {
  await show(<TransportWorkspace actorId="u" branchId={branch} initialStatus="requested" />);
  await screen.findByRole('button', { name: 'Requests: 1' });
  await waitFor(() =>
    expect(sdk.readBranchTransport).toHaveBeenCalledWith(
      expect.anything(),
      branch,
      expect.objectContaining({ status: 'requested' }),
    ),
  );
});
