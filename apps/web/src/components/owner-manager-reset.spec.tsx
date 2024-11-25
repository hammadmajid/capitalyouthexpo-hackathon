import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listOwnerManagers, type OwnerSetupActions } from '@hsm/api-client';
import { OwnerManagerReset } from './owner-manager-reset';
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listOwnerManagers: vi.fn(),
}));
const id = '550e8400-e29b-41d4-a716-446655440000';
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listOwnerManagers).mockResolvedValue({
    data: [
      { id, userId: id, branchId: id, fullName: 'Pending Manager', status: 'pending_activation' },
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        userId: id,
        branchId: id,
        fullName: 'Active Manager',
        status: 'active',
      },
    ],
    nextCursor: null,
  });
});
afterEach(cleanup);
function mount() {
  const resetInvitation = vi.fn().mockResolvedValue({ generatedTempPassword: 'TestPassword!778' }),
    forgetInvitationReset = vi.fn();
  const q = render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <OwnerManagerReset
        userId={id}
        branchId={id}
        actions={{ resetInvitation, forgetInvitationReset } as unknown as OwnerSetupActions}
      />
    </QueryClientProvider>,
  );
  return { ...q, resetInvitation, forgetInvitationReset };
}
async function select() {
  fireEvent.click(screen.getByRole('button', { name: 'Reset a pending invitation' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Pending Manager' }));
}
it('AUTH-M SEC: recovery starts closed, lists named pending invitations and never offers active Manager credentials', async () => {
  const q = mount();
  expect(listOwnerManagers).not.toHaveBeenCalled();
  await select();
  expect(screen.queryByRole('button', { name: 'Active Manager' })).toBeNull();
  expect(screen.queryByText(id)).toBeNull();
  expect(q.resetInvitation).not.toHaveBeenCalled();
});
it.each([false, true])(
  'AUTH-M: %s replacement mode uses the actual scoped form and clears one-response secrets',
  async (manual) => {
    const q = mount();
    await select();
    if (manual) {
      q.resetInvitation.mockResolvedValueOnce({});
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.change(screen.getByLabelText('Replacement temporary password'), {
        target: { value: 'ManualPassword!778' },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Replace temporary credential' }));
    await waitFor(() =>
      expect(q.resetInvitation).toHaveBeenCalledWith(id, id, {
        temporaryCredential: manual
          ? { mode: 'manual', password: 'ManualPassword!778' }
          : { mode: 'auto' },
      }),
    );
    await screen.findByRole('status');
    if (manual)
      expect(screen.getByLabelText<HTMLInputElement>('Replacement temporary password').value).toBe(
        '',
      );
    else {
      expect(screen.getByText('TestPassword!778')).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: 'Hide replacement password' }));
      expect(screen.queryByText('TestPassword!778')).toBeNull();
    }
    q.unmount();
    expect(q.forgetInvitationReset).toHaveBeenCalledWith(id);
  },
);
it('SEC: reset rejection is safe and cannot expose private provider details or credentials', async () => {
  const q = mount();
  await select();
  q.resetInvitation.mockRejectedValueOnce(new Error('Private provider credential'));
  fireEvent.click(screen.getByRole('button', { name: 'Replace temporary credential' }));
  expect((await screen.findByRole('alert')).textContent).not.toContain(
    'Private provider credential',
  );
  expect(screen.queryByText('TestPassword!778')).toBeNull();
});
it('SEC: closing a deferred replacement clears retry state and discards its late credential', async () => {
  const q = mount();
  await select();
  let resolve: (value: unknown) => void = () => undefined;
  q.resetInvitation.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Replace temporary credential' }));
  await waitFor(() => expect(q.resetInvitation).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Close invitation recovery' }));
  await act(async () => {
    resolve({ generatedTempPassword: 'LateReplacement!778' });
  });
  expect(screen.queryByText('LateReplacement!778')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Replace temporary credential' })).toBeNull();
  expect(q.forgetInvitationReset).toHaveBeenCalledWith(id);
});
