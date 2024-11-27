import { useState } from 'react';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { readResidentProfile, updateResidentContact } from '@hsm/api-client';
import { StaffResidentHeader } from './staff-resident-header';
import { ResidentEditDialog } from './resident-edit-dialog';
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({}) }));
jest.mock('@hsm/api-client', () => ({
  readResidentProfile: jest.fn(),
  updateResidentContact: jest.fn(),
}));
jest.mock('./stay-resident-photo', () => ({ StayResidentPhoto: () => null }));
function Resident() {
  const [editing, setEditing] = useState(false);
  const [agreement, setAgreement] = useState(false);
  return (
    <>
      <Text>Resident overview stays in place</Text>
      {agreement ? <Text>Agreement workspace</Text> : null}
      <StaffResidentHeader
        actorId="actor"
        branchId="branch"
        data={
          {
            id: 'stay',
            residentId: 'resident',
            displayName: 'Ali',
            state: 'active',
            contact: { phone: '+923154796657', email: 'ali@example.test' },
          } as never
        }
        onClose={() => undefined}
        onEdit={() => setEditing(true)}
        onHistory={() => undefined}
        onAgreement={() => setAgreement(true)}
      />
      {editing ? (
        <ResidentEditDialog
          actorId="actor"
          branchId="branch"
          residentId="resident"
          name="Ali"
          phone="+923154796657"
          email="ali@example.test"
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
async function show(linked = false) {
  jest.mocked(readResidentProfile).mockResolvedValue({ linked, cnicLast4: null } as never);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={cache}>
      <Resident />
    </QueryClientProvider>,
  );
  await screen.findByText('No CNIC');
}
beforeEach(() => jest.clearAllMocks());
it('RES-004: Agreement is only in More and opens from its floating menu', async () => {
  await show();
  expect(screen.queryByRole('button', { name: 'Agreement' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back to residents' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'More resident actions' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Agreement' }));
  expect(screen.getByText('Agreement workspace')).toBeTruthy();
});
it('RES-004: shows the linked customer account state from the authorized profile', async () => {
  await show(true);
  expect(screen.getByText('Customer account linked')).toBeTruthy();
  expect(screen.queryByText('No customer account')).toBeNull();
});
it('RES-006: opens Edit through the three-dot floating menu as a separate dialog card', async () => {
  await show();
  expect(screen.queryByRole('button', { name: 'Edit resident' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'More resident actions' }));
  expect(screen.getByLabelText('Resident actions menu')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Edit resident' }));
  expect(await screen.findByLabelText('Edit resident dialog')).toBeTruthy();
  expect(screen.getByLabelText('Resident name').props.value).toBe('Ali');
  expect(
    screen.getByText('Resident overview stays in place', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(updateResidentContact).not.toHaveBeenCalled();
});
it('RES-006: cancelling the edit card returns to the same resident without a write', async () => {
  await show();
  await fireEvent.press(screen.getByRole('button', { name: 'More resident actions' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Edit resident' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Cancel resident edit' }));
  expect(screen.queryByLabelText('Edit resident dialog')).toBeNull();
  expect(screen.getByText('Resident overview stays in place')).toBeTruthy();
  expect(updateResidentContact).not.toHaveBeenCalled();
});
it('RES-006 / CHG-009: keeps staff Edit hidden for a linked customer', async () => {
  await show(true);
  await fireEvent.press(screen.getByRole('button', { name: 'More resident actions' }));
  expect(screen.queryByRole('button', { name: 'Edit resident' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Resident stay history' })).toBeTruthy();
});
