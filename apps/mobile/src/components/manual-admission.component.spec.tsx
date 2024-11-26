jest.mock('./private-file-picker', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PrivateFilePicker: ({ label, onReady }: { label: string; onReady: (id: string) => void }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Choose ' + label}
        onPress={() => onReady('11111111-1111-4111-8111-111111111112')}
      >
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createManualStay,
  readBillingSettings,
  readBranchOccupancy,
  readStaffStays,
} from '@hsm/api-client';
import { NativeManualAdmission, canAdmitResidents } from './manual-admission';
import { pickDate } from '../test-utils/pick-date';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readBillingSettings: jest.fn(),
  createManualStay: jest.fn(),
  readStaffStays: jest.fn(),
  readBranchOccupancy: jest.fn(),
}));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  typeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  roomId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  bedId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  versionId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
// ACC-001: the fixture bed is reported free by the bed board.
beforeEach(() => {
  jest
    .mocked(readBranchOccupancy)
    .mockResolvedValue({ data: [{ id: roomId, beds: [{ id: bedId }] }] } as never);
});
const policy = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'full_period' },
  graceDays: 0,
  lateCharge: { kind: 'disabled' },
  noticeDays: 30,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: true,
  customCharges: 'catalog_only',
};
const inventory = {
  roomTypes: [
    {
      id: typeId,
      fees: [],
      bedMonthlyRentPaisa: 1800000,
      roomMonthlyRentPaisa: null,
    },
  ],
  rooms: [
    {
      id: roomId,
      branchId,
      roomTypeId: typeId,
      label: 'R1',
      status: 'active',
      archivedAt: null,
      seats: [
        { id: bedId, roomId, label: 'B1', ordinal: 1, status: 'active', archivedAt: null },
        {
          id: versionId,
          roomId,
          label: 'B2',
          ordinal: 2,
          status: 'maintenance',
          archivedAt: null,
        },
      ],
    },
  ],
  permissions: ['stay_manage', 'rent_manage', 'finance_view'],
  canConfigureManagers: false,
} as never;
function view(
  initialBedId?: string,
  selected: Parameters<typeof NativeManualAdmission>[0]['inventory'] = inventory,
) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { gcTime: 0 }, mutations: { gcTime: 0 } } })
      }
    >
      <NativeManualAdmission
        actorId="actor"
        branchId={branchId}
        inventory={selected}
        disabled={false}
        {...(initialBedId ? { initialBedId } : {})}
      />
    </QueryClientProvider>,
  );
}
it('STAY-001: offers walk-in admission only with stay, rent and finance grants', () => {
  expect(canAdmitResidents(inventory)).toBe(true);
  expect(
    canAdmitResidents({ ...(inventory as object), permissions: ['stay_manage'] } as never),
  ).toBe(false);
});
it('STAY-001 / ACC-001: admits a new resident into an active bed with one retained key', async () => {
  jest.mocked(readBillingSettings).mockResolvedValue({
    effectiveVersion: { id: versionId, policy },
  } as never);
  jest
    .mocked(createManualStay)
    .mockResolvedValue({ stayId: '11111111-1111-4111-8111-111111111111' } as never);
  await view();
  await fireEvent.press(screen.getByRole('button', { name: 'Admit walk-in resident' }));
  expect(screen.queryByRole('button', { name: 'R1 · B2' })).toBeNull();
  await fireEvent.press(await screen.findByRole('button', { name: 'R1 · B1' }));
  expect(screen.getByDisplayValue('18,000')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Resident name'), 'Walk In');
  await pickDate('Move-in date', '2028-02-01');
  await waitFor(() => expect(readBillingSettings).toHaveBeenCalled());
  // CHG-054: a new resident needs a complete CNIC before Confirm turns on.
  expect(screen.getByRole('button', { name: 'Confirm admission' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('CNIC'), '3520212345671');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirm admission' })).toBeEnabled(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm admission' }));
  expect(await screen.findByText('Resident admitted. The Stay is active.')).toBeTruthy();
  const [, branch, body, key] = jest.mocked(createManualStay).mock.calls[0] ?? [];
  expect(branch).toBe(branchId);
  expect(key).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  expect(body).toMatchObject({
    manual: {
      resident: { kind: 'new', profile: { displayName: 'Walk In', cnic: '3520212345671' } },
      target: { kind: 'bed', roomId, bedId },
      terms: { policyVersionId: versionId, rentAmountPaisa: 1800000, depositPaisa: 0 },
    },
  });
});
it('STAY-001: blocks admission when no billing policy applies', async () => {
  jest.mocked(readBillingSettings).mockResolvedValue({ effectiveVersion: null } as never);
  await view();
  await fireEvent.press(screen.getByRole('button', { name: 'Admit walk-in resident' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'R1 · B1' }));
  expect(await screen.findByText(/No billing policy applies/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Confirm admission' })).toBeDisabled();
});
it('RENT-003: asks for a first rent charge only under manual proration', async () => {
  jest.mocked(readBillingSettings).mockResolvedValue({
    effectiveVersion: { id: versionId, policy: { ...policy, proration: { kind: 'manual' } } },
  } as never);
  await view();
  await fireEvent.press(screen.getByRole('button', { name: 'Admit walk-in resident' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'R1 · B1' }));
  expect(await screen.findByLabelText('First rent charge (PKR)')).toBeTruthy();
});
it('RES-001 / CHG-009: admits an existing branch resident chosen from Stay history', async () => {
  const residentId = '22222222-2222-4222-8222-222222222222';
  jest.mocked(readBillingSettings).mockResolvedValue({
    effectiveVersion: { id: versionId, policy },
  } as never);
  jest.mocked(readStaffStays).mockResolvedValue({
    data: [
      { residentId, displayName: 'Former Resident' },
      { residentId, displayName: 'Former Resident' },
    ],
    nextCursor: null,
  } as never);
  jest
    .mocked(createManualStay)
    .mockResolvedValue({ stayId: '11111111-1111-4111-8111-111111111111' } as never);
  await view();
  await fireEvent.press(screen.getByRole('button', { name: 'Admit walk-in resident' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'R1 · B1' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Existing resident' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Search Select resident' }));
  await fireEvent.changeText(screen.getByLabelText('Search residents by name'), 'Former');
  await fireEvent.press(screen.getByRole('button', { name: 'Search residents' }));
  await waitFor(() =>
    expect(readStaffStays).toHaveBeenLastCalledWith({}, branchId, { limit: 20, q: 'Former' }),
  );
  const options = await screen.findAllByRole('button', { name: 'Select Former Resident' });
  expect(options).toHaveLength(1);
  await fireEvent.press(options[0] as never);
  await pickDate('Move-in date', '2028-02-01');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirm admission' })).toBeEnabled(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm admission' }));
  expect(await screen.findByText('Resident admitted. The Stay is active.')).toBeTruthy();
  const [, , body] = jest.mocked(createManualStay).mock.calls.at(-1) ?? [];
  expect(body).toMatchObject({ manual: { resident: { kind: 'existing', residentId } } });
});

it('BED-002 / STAY-001: vacant-bed entry starts with the exact selected bed and saved price', async () => {
  jest
    .mocked(readBillingSettings)
    .mockResolvedValue({ effectiveVersion: { id: versionId, policy } } as never);
  await view(bedId);
  expect(screen.queryByRole('button', { name: 'Admit walk-in resident' })).toBeNull();
  // The bed is fixed by the bed screen, so no bed picker is shown.
  expect(screen.queryByRole('button', { name: 'R1 · B1' })).toBeNull();
  expect(screen.getByText('Add resident')).toBeTruthy();
  await waitFor(() =>
    expect(readBillingSettings).toHaveBeenCalledWith({}, { branchId, roomTypeId: typeId }),
  );
  expect(screen.getByDisplayValue('18,000')).toBeTruthy();
});

it.each([true, false])(
  'CHG-058 / RES-001: selected bed rent/security defaults remain editable (preselected %s)',
  async (preselected) => {
    jest
      .mocked(readBillingSettings)
      .mockResolvedValue({ effectiveVersion: { id: versionId, policy } } as never);
    const changed = JSON.parse(JSON.stringify(inventory)) as Parameters<
      typeof NativeManualAdmission
    >[0]['inventory'];
    const seat = changed.rooms[0]?.seats[0];
    if (!seat) throw new Error('Missing fixture bed');
    seat.monthlyRentPaisa = 2345678;
    seat.depositPaisa = 1234567;
    await view(preselected ? bedId : undefined, changed);
    if (!preselected) {
      await fireEvent.press(screen.getByRole('button', { name: 'Admit walk-in resident' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'R1 · B1' }));
    }
    expect(screen.getByLabelText('Agreed monthly rent (PKR)').props.value).toBe('23,456.78');
    expect(screen.getByLabelText('Security deposit (PKR)').props.value).toBe('12,345.67');
    await fireEvent.changeText(screen.getByLabelText('Security deposit (PKR)'), '9000');
    expect(screen.getByLabelText('Security deposit (PKR)').props.value).toBe('9,000');
  },
);

it('RES-001 / SEC-003: the CNIC camera keeps its photo reference in the new resident admission', async () => {
  jest
    .mocked(readBillingSettings)
    .mockResolvedValue({ effectiveVersion: { id: versionId, policy } } as never);
  jest
    .mocked(createManualStay)
    .mockResolvedValue({ stayId: '11111111-1111-4111-8111-111111111111' } as never);
  await view();
  await fireEvent.press(screen.getByRole('button', { name: 'Admit walk-in resident' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'R1 · B1' }));
  await fireEvent.changeText(screen.getByLabelText('Resident name'), 'Resident with photo');
  await fireEvent.changeText(screen.getByLabelText('CNIC'), '3520212345671');
  await pickDate('Move-in date', '2028-02-01');
  await fireEvent.press(screen.getByRole('button', { name: 'Add CNIC photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Choose CNIC photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirm admission' })).toBeEnabled(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm admission' }));
  await waitFor(() =>
    expect(createManualStay).toHaveBeenLastCalledWith(
      expect.anything(),
      branchId,
      expect.objectContaining({ cnicPhotoFileId: '11111111-1111-4111-8111-111111111112' }),
      expect.any(String),
    ),
  );
});
