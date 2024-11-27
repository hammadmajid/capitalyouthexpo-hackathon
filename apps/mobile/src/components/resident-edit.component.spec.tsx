/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { updateResidentContact } from '@hsm/api-client';
import { ResidentEdit, toE164 } from './resident-edit';
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  updateResidentContact: jest.fn(),
}));
const branchId = '10000000-0000-4000-8000-000000000001',
  residentId = '10000000-0000-4000-8000-000000000002';
it('RES-006: local numbers become +92 and empty contacts stay empty', () => {
  expect(toE164('0300 1234567')).toBe('+923001234567');
  expect(toE164('923001234567')).toBe('+923001234567');
  expect(toE164('')).toBeNull();
});
it('RES-006: saves corrected details for the exact resident and closes', async () => {
  jest.mocked(updateResidentContact).mockResolvedValue({} as never);
  const close = jest.fn();
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <ResidentEdit
        actorId="owner"
        branchId={branchId}
        residentId={residentId}
        name="Ali"
        phone={null}
        email={null}
        onClose={close}
      />
    </QueryClientProvider>,
  );
  await fireEvent.changeText(screen.getByLabelText('Resident name'), 'Ali Raza');
  await fireEvent.changeText(screen.getByLabelText('Resident phone'), '03001234567');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(updateResidentContact).toHaveBeenCalledWith({}, branchId, residentId, {
    displayName: 'Ali Raza',
    phone: '+923001234567',
    email: null,
  });
});
it('RES-006: an invalid phone keeps Save disabled', async () => {
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <ResidentEdit
        actorId="owner"
        branchId={branchId}
        residentId={residentId}
        name="Ali"
        phone={null}
        email={null}
        onClose={jest.fn()}
      />
    </QueryClientProvider>,
  );
  await fireEvent.changeText(screen.getByLabelText('Resident phone'), '12');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});
