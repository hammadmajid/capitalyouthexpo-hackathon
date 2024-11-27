jest.mock('../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readBranchOccupancy: jest.fn(),
  readInventoryAccess: jest.fn(),
  readBranchInventory: jest.fn(),
}));
// The admission form and bed detail have their own suites; here we check what opens.
jest.mock('./manual-admission', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    canAdmitResidents: () => true,
    NativeManualAdmission: (props: { initialBedId?: string }) => (
      <Text>Admission form for {props.initialBedId}</Text>
    ),
  };
});
jest.mock('./bed-detail', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { NativeBedDetail: (props: { bedId: string }) => <Text>Bed detail {props.bedId}</Text> };
});
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readBranchInventory, readBranchOccupancy, readInventoryAccess } from '@hsm/api-client';
import { RoomBoard } from './room-board';
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const branchId = id(1);
const buildingA = { id: id(2), name: 'Building A' },
  buildingB = { id: id(3), name: 'Building B' };
const floor1 = { id: id(4), label: 'Floor 1', levelNumber: 1 },
  floor9 = { id: id(5), label: 'Floor 9', levelNumber: 9 };
function bed(n: number, state: string, rentStatus: string | null = null) {
  return {
    id: id(100 + n),
    label: 'T-' + n,
    ordinal: n,
    status: 'active',
    state,
    rentStatus,
    occupant: state === 'occupied' ? { stayId: id(200 + n), displayName: 'R' + n } : null,
  };
}
function room(n: number, label: string, building: object, floor: object, beds: object[]) {
  return { id: id(300 + n), label, roomTypeId: id(9), status: 'active', building, floor, beds };
}
const totals = { beds: 5, occupied: 3, blocked: 0, reserved: 0, unavailable: 0, available: 2 };
const first = {
  branchId,
  on: '2026-11-17',
  totals,
  data: [
    room(1, '101', buildingA, floor1, [
      bed(1, 'occupied', 'paid'),
      bed(2, 'available'),
      bed(3, 'occupied', 'due'),
    ]),
  ],
  nextCursor: id(301),
};
const second = {
  ...first,
  data: [room(2, '901', buildingB, floor9, [bed(1, 'occupied', 'overdue'), bed(2, 'available')])],
  nextCursor: null,
};
async function view() {
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <RoomBoard actorId="actor" branchId={branchId} />
    </QueryClientProvider>,
  );
}
async function choose(label: string, option: string) {
  await fireEvent.press(await screen.findByLabelText(label));
  await fireEvent.press(
    within(await screen.findByLabelText(label.split(':')[0] + ' choices')).getByLabelText(option),
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(readBranchOccupancy)
    .mockImplementation(
      async (_client, _branch, query) =>
        ((query as { cursor?: string }).cursor ? second : first) as never,
    );
  jest.mocked(readInventoryAccess).mockResolvedValue({
    permissions: ['stay_manage', 'rent_manage', 'finance_view'],
  } as never);
  jest.mocked(readBranchInventory).mockResolvedValue({ permissions: [] } as never);
});
it('BED-001 / CHG-048: reads every occupancy page and groups building, floor and room', async () => {
  await view();
  // The first building shows first, as in the approved reference.
  expect(await screen.findByLabelText('Building: Building A')).toBeTruthy();
  expect(await screen.findByText('Room 101')).toBeTruthy();
  expect(screen.queryByText('Room 901')).toBeNull();
  await choose('Building: Building A', 'All Buildings');
  expect(screen.getByText('Room 901')).toBeTruthy();
  expect(readBranchOccupancy).toHaveBeenCalledTimes(2);
  expect(jest.mocked(readBranchOccupancy).mock.calls[1]?.[2]).toEqual({
    limit: 50,
    cursor: id(301),
  });
  expect(screen.getByText('Floor 1')).toBeTruthy();
  expect(screen.getByLabelText('5 Total Beds')).toBeTruthy();
  expect(screen.getByLabelText('3 Occupied')).toBeTruthy();
  expect(screen.getByLabelText('2 Vacant')).toBeTruthy();
  expect(screen.getByLabelText('0 Reserved')).toBeTruthy();
  expect(screen.getByLabelText('1 Paid')).toBeTruthy();
  expect(screen.getByLabelText('1 Due')).toBeTruthy();
  expect(screen.getByLabelText('1 Overdue')).toBeTruthy();
  expect(screen.getByLabelText('0 Proof sent')).toBeTruthy();
  // Status is spoken, never colour alone.
  expect(screen.getByLabelText('Room 101, bed T-1, Occupied, Paid')).toBeTruthy();
  expect(screen.getByLabelText('Room 901, bed T-1, Occupied, Overdue')).toBeTruthy();
  expect(screen.getByLabelText('Room 101, bed T-2, Vacant')).toBeTruthy();
});
it('narrows rooms and totals to the chosen building', async () => {
  await view();
  await screen.findByText('Room 101');
  await choose('Building: Building A', 'Building B');
  await waitFor(() => expect(screen.queryByText('Room 101')).toBeNull());
  expect(screen.getByText('Room 901')).toBeTruthy();
  expect(screen.getByLabelText('2 Total Beds')).toBeTruthy();
  expect(screen.getByLabelText('1 Overdue')).toBeTruthy();
  expect(screen.getByLabelText('0 Paid')).toBeTruthy();
});
it('BED-002: a vacant bed opens Add Resident for that bed; an occupied bed opens its details', async () => {
  await view();
  await fireEvent.press(await screen.findByLabelText('Room 101, bed T-2, Vacant'));
  expect(await screen.findByText('Admission form for ' + id(102))).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Close add resident'));
  await fireEvent.press(await screen.findByLabelText('Room 101, bed T-3, Occupied, Due'));
  expect(await screen.findByText('Bed detail ' + id(103))).toBeTruthy();
});
it('RENT-004: without finance access the board shows no rent counts', async () => {
  jest.mocked(readBranchOccupancy).mockReset();
  jest.mocked(readBranchOccupancy).mockResolvedValue({
    ...second,
    data: second.data.map((item) => ({
      ...item,
      beds: item.beds.map((entry) => ({ ...entry, rentStatus: null })),
    })),
  } as never);
  await view();
  expect(await screen.findByLabelText('Room 901, bed T-1, Occupied')).toBeTruthy();
  expect(screen.queryByLabelText(/Paid$/)).toBeNull();
  expect(screen.queryByText('Overdue')).toBeNull();
});
