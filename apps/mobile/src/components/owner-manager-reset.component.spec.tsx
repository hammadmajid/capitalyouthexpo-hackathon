/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { OwnerSetupActions } from '@hsm/api-client';
import { OwnerManagerReset } from './owner-manager-reset';
jest.mock('../lib/runtime', () => ({ client: {} }));
const id = '550e8400-e29b-41d4-a716-446655440000';
const assignment = { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pending Manager' };
async function mount() {
  const resetInvitation = jest.fn().mockResolvedValue({}),
    forgetInvitationReset = jest.fn();
  const q = await render(
    <OwnerManagerReset
      branchId={id}
      assignment={assignment}
      actions={{ resetInvitation, forgetInvitationReset } as unknown as OwnerSetupActions}
    />,
  );
  return { ...q, resetInvitation, forgetInvitationReset };
}
test('AUTH-M-003: the Owner types the new password for this pending invitation only', async () => {
  const q = await mount();
  expect(screen.queryByRole('button', { name: 'Generate replacement automatically' })).toBeNull();
  await fireEvent.changeText(
    screen.getByLabelText('Replacement temporary password'),
    'ManualPassword!778',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Save new password' }));
  await waitFor(() =>
    expect(q.resetInvitation).toHaveBeenCalledWith(id, assignment.id, {
      temporaryCredential: { mode: 'manual', password: 'ManualPassword!778' },
    }),
  );
  await screen.findByText('New password saved. Share it with Pending Manager.');
  expect(screen.getByLabelText('Replacement temporary password').props.value).toBe('');
  await q.unmount();
  expect(q.forgetInvitationReset).toHaveBeenCalledWith(id);
});
test('SEC: a rejected new password stays safe without revealing provider details', async () => {
  const q = await mount();
  q.resetInvitation.mockRejectedValueOnce(new Error('Private provider credential'));
  await fireEvent.changeText(
    screen.getByLabelText('Replacement temporary password'),
    'ManualPassword!778',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Save new password' }));
  expect((await screen.findByRole('alert')).props.children).not.toContain(
    'Private provider credential',
  );
});
