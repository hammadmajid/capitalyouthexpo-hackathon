/// <reference types="jest" />
import { render, screen, fireEvent, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiFailure,
  createInventoryRoom,
  createInventoryBed,
  saveInventoryRoomType,
} from '@hsm/api-client';
import type { ComponentProps } from 'react';
import {
  inventory,
  branchId,
  typeId,
  roomId,
  seatId,
} from '../../test/unit/inventory-pages.fixture';
import { NativeInventoryCreate } from './inventory-create';
import { NativeInventoryNavigationProvider } from './native-inventory-navigation';
import { actorClient } from '../lib/runtime';

jest.mock('../lib/runtime', () => ({ actorClient: jest.fn() }));
jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => '019a1234-1234-7123-8123-' + String(++sequence).padStart(12, '0') };
});
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  createInventoryRoom: jest.fn(),
  createInventoryBed: jest.fn(),
  saveInventoryRoomType: jest.fn(),
}));
type Props = ComponentProps<typeof NativeInventoryCreate>;
const client = {} as Awaited<ReturnType<typeof actorClient>>;
let props: Props,
  cache: QueryClient,
  sequence = 0;
beforeEach(() => {
  jest.clearAllMocks();
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  props = {
    actorId: '019a1234-1234-7123-8123-' + String(++sequence).padStart(12, '0'),
    branchId,
    data: inventory,
    unavailable: false,
    blocked: false,
  };
  jest.mocked(actorClient).mockResolvedValue(client);
  jest.mocked(createInventoryRoom).mockResolvedValue({ id: roomId, branchId, kind: 'room' });
  jest.mocked(createInventoryBed).mockResolvedValue({ id: seatId, branchId, kind: 'seat' });
  jest.mocked(saveInventoryRoomType).mockResolvedValue({ id: typeId, branchId, kind: 'room_type' });
});
afterEach(() => cache.clear());
function view() {
  return (
    <QueryClientProvider client={cache}>
      <NativeInventoryNavigationProvider>
        <NativeInventoryCreate {...props} />
      </NativeInventoryNavigationProvider>
    </QueryClientProvider>
  );
}
async function open() {
  const mounted = await render(view());
  await userEvent.press(screen.getByRole('button', { name: 'Create inventory' }));
  return mounted;
}
async function roomForm() {
  await userEvent.press(screen.getByRole('button', { name: 'Create individual room' }));
  await userEvent.press(screen.getByRole('button', { name: 'Create in Two beds' }));
  await fireEvent.changeText(screen.getByLabelText('Room number'), 'E2E-OWNER-101');
}
test('ROOM-001/002: room creation binds canonical parent, branch, inactive state and idempotency key', async () => {
  await open();
  await roomForm();
  await userEvent.press(screen.getByRole('button', { name: 'Save new room' }));
  await waitFor(() =>
    expect(createInventoryRoom).toHaveBeenCalledWith(
      client,
      branchId,
      { roomTypeId: typeId, label: 'E2E-OWNER-101', status: 'inactive' },
      expect.any(String),
    ),
  );
  expect(actorClient).toHaveBeenCalledWith(props.actorId);
  expect(await screen.findByText(/Inventory saved by the server/)).toBeVisible();
});
test('ROOM-002: bed creation uses the exact selected room without creating a room or pricing', async () => {
  await open();
  await userEvent.press(screen.getByRole('button', { name: 'Create individual bed' }));
  await userEvent.press(screen.getByRole('button', { name: 'Create in 101' }));
  await fireEvent.changeText(screen.getByLabelText('Bed label'), 'E2E-OWNER-B');
  await userEvent.press(screen.getByRole('button', { name: 'Save new bed' }));
  await waitFor(() =>
    expect(createInventoryBed).toHaveBeenCalledWith(
      client,
      branchId,
      roomId,
      { label: 'E2E-OWNER-B', status: 'inactive' },
      expect.any(String),
    ),
  );
  expect(createInventoryRoom).not.toHaveBeenCalled();
  expect(saveInventoryRoomType).not.toHaveBeenCalled();
});
test('ROOM-001 ACC-004: new type uses canonical integer paisa including disclosed fees', async () => {
  props.data = { ...inventory, permissions: ['pricing_edit'] };
  await open();
  expect(screen.queryByRole('button', { name: 'Create individual room' })).toBeNull();
  await userEvent.press(screen.getByRole('button', { name: 'Create room type' }));
  await fireEvent.changeText(screen.getByLabelText('Room type name'), 'E2E-OWNER-type');
  await userEvent.press(screen.getByRole('button', { name: 'Per bed' }));
  await fireEvent.changeText(screen.getByLabelText('Room capacity'), '2');
  await fireEvent.changeText(screen.getByLabelText('Monthly bed rent (Rs)'), '12000.01');
  await fireEvent.changeText(screen.getByLabelText('Security deposit (Rs)'), '0');
  await userEvent.press(screen.getByRole('button', { name: 'Add new disclosed fee' }));
  await fireEvent.changeText(screen.getByLabelText('New fee 1 code'), 'utilities');
  await fireEvent.changeText(screen.getByLabelText('New fee 1 cadence'), 'monthly');
  await fireEvent.changeText(screen.getByLabelText('New fee 1 amount (Rs)'), '15.25');
  await userEvent.press(screen.getByRole('button', { name: 'Save new room type' }));
  await waitFor(() =>
    expect(saveInventoryRoomType).toHaveBeenCalledWith(
      client,
      branchId,
      {
        name: 'E2E-OWNER-type',
        inventoryMode: 'per_bed',
        capacity: 2,
        bedMonthlyRentPaisa: 1200001,
        roomMonthlyRentPaisa: null,
        depositPaisa: 0,
        fees: [{ code: 'utilities', cadence: 'monthly', amountPaisa: 1525 }],
      },
      expect.any(String),
    ),
  );
});
test('SEC-003: read-only actors have no creation controls and archived parents are unavailable', async () => {
  props.data = { ...inventory, permissions: [] };
  const mounted = await render(view());
  expect(screen.queryByRole('button', { name: 'Create inventory' })).toBeNull();
  props.data = {
    ...inventory,
    roomTypes: inventory.roomTypes.map((row) => ({ ...row, archivedAt: '2026-10-29T00:00:00Z' })),
  };
  await mounted.rerender(view());
  await userEvent.press(screen.getByRole('button', { name: 'Create inventory' }));
  await userEvent.press(screen.getByRole('button', { name: 'Create individual room' }));
  expect(screen.queryByRole('button', { name: 'Create in Two beds' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Save new room' })).toBeDisabled();
});
test('ROOM-001: validation failure retains fields without sending a blank room', async () => {
  await open();
  await roomForm();
  await fireEvent.changeText(screen.getByLabelText('Room number'), ' ');
  await userEvent.press(screen.getByRole('button', { name: 'Save new room' }));
  expect(await screen.findByText('Check name or number.')).toBeVisible();
  expect(createInventoryRoom).not.toHaveBeenCalled();
});
test('AUD-003 ACC-001: unknown creation survives remount and retries the exact original body/key', async () => {
  jest.mocked(createInventoryRoom).mockRejectedValueOnce(new Error('Interrupted'));
  const mounted = await open();
  await roomForm();
  await userEvent.press(screen.getByRole('button', { name: 'Save new room' }));
  await screen.findByRole('button', { name: 'Retry original inventory creation' });
  expect(screen.getByRole('button', { name: 'Close inventory creation' })).toBeDisabled();
  const original = jest.mocked(createInventoryRoom).mock.calls[0];
  await mounted.unmount();
  await render(view());
  await userEvent.press(screen.getByRole('button', { name: 'Retry original inventory creation' }));
  await waitFor(() => expect(createInventoryRoom).toHaveBeenCalledTimes(2));
  expect(jest.mocked(createInventoryRoom).mock.calls[1]).toEqual(original);
  expect(await screen.findByText(/Inventory saved by the server/)).toBeVisible();
});
test('SEC-003: definitive scope denial removes mutation controls; refresh outage disables creation', async () => {
  jest.mocked(createInventoryRoom).mockRejectedValueOnce(
    new ApiFailure({
      type: 'urn:hsm:error:forbidden',
      title: 'Forbidden',
      status: 403,
      code: 'FORBIDDEN',
      detail: 'Forbidden',
      traceId: '019a1234-1234-7123-8123-123456789abc',
    }),
  );
  const mounted = await open();
  await roomForm();
  await userEvent.press(screen.getByRole('button', { name: 'Save new room' }));
  expect(await screen.findByText('You do not have access to this action.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Create individual room' })).toBeNull();
  props.unavailable = true;
  await userEvent.press(screen.getByRole('button', { name: 'Close inventory creation' }));
  await mounted.rerender(view());
  expect(screen.getByRole('button', { name: 'Create inventory' })).toBeDisabled();
});
