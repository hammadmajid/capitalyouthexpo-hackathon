import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OwnerSetupActions } from '@hsm/api-client';
import { OwnerInvitation } from './owner-invitation';
afterEach(cleanup);
const id = '550e8400-e29b-41d4-a716-446655440000';
function mount(acceptance = 'temporary_password', generated = true) {
  const invite = vi.fn().mockResolvedValue({
    acceptance,
    ...(generated ? { generatedTempPassword: 'GeneratedPassword!778' } : {}),
  });
  const forgetInvitation = vi.fn();
  const mounted = render(
    <OwnerInvitation
      branchId={id}
      actions={{ invite, forgetInvitation } as unknown as OwnerSetupActions}
    />,
  );
  return { ...mounted, invite, forgetInvitation, user: userEvent.setup() };
}
it('AUTH-M-001: self-management is the default and creates no Manager assignment', () => {
  const q = mount();
  expect(screen.getByText(/You can manage your own branch/)).toBeDefined();
  expect(screen.queryByLabelText('Manager full name')).toBeNull();
  expect(q.invite).not.toHaveBeenCalled();
});
it.each([false, true])(
  'AUTH-M-001: actual %s credential mode validates input and never persists a displayed secret',
  async (manual) => {
    const q = mount('temporary_password', !manual);
    await q.user.click(screen.getByRole('button', { name: 'Invite a Manager' }));
    if (manual) await q.user.click(screen.getByRole('checkbox'));
    await q.user.click(screen.getByLabelText('Manager full name'));
    await q.user.paste('Manager name');
    await q.user.click(screen.getByLabelText('Manager mobile number'));
    await q.user.paste('03001234567');
    if (manual) {
      await q.user.click(screen.getByLabelText('Temporary password'));
      await q.user.paste('ManualPassword!778');
    }
    await q.user.click(screen.getByRole('button', { name: 'Send Manager invitation' }));
    expect(q.invite).toHaveBeenCalledWith(id, {
      fullName: 'Manager name',
      phone: '+923001234567',
      temporaryCredential: manual
        ? { mode: 'manual', password: 'ManualPassword!778' }
        : { mode: 'auto' },
    });
    await screen.findByRole('status');
    if (!manual) {
      expect(screen.getByText('GeneratedPassword!778')).toBeDefined();
      await q.user.click(screen.getByRole('button', { name: 'Hide temporary password' }));
      expect(screen.queryByText('GeneratedPassword!778')).toBeNull();
    } else expect(screen.getByLabelText<HTMLInputElement>('Temporary password').value).toBe('');
    q.unmount();
    expect(q.forgetInvitation).toHaveBeenCalledWith(id);
  },
);
it('SEC: invitation errors remain safe and closing the form discards retry state', async () => {
  const q = mount();
  q.invite.mockRejectedValue(new Error('private provider detail'));
  await q.user.click(screen.getByRole('button', { name: 'Invite a Manager' }));
  await q.user.click(screen.getByLabelText('Manager full name'));
  await q.user.paste('Manager name');
  await q.user.click(screen.getByLabelText('Manager mobile number'));
  await q.user.paste('03001234567');
  await q.user.click(screen.getByRole('button', { name: 'Send Manager invitation' }));
  expect((await screen.findByRole('alert')).textContent).not.toContain('private provider detail');
  await q.user.click(screen.getByRole('button', { name: 'I will manage this branch' }));
  expect(screen.queryByLabelText('Manager full name')).toBeNull();
  expect(q.forgetInvitation).toHaveBeenCalledWith(id);
});

it('SEC: closing a deferred invitation discards its late temporary credential', async () => {
  const q = mount();
  let resolve: (value: unknown) => void = () => undefined;
  q.invite.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Invite a Manager' }));
  fireEvent.change(screen.getByLabelText('Manager full name'), {
    target: { value: 'Manager name' },
  });
  fireEvent.change(screen.getByLabelText('Manager mobile number'), {
    target: { value: '03001234567' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send Manager invitation' }));
  await waitFor(() => expect(q.invite).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'I will manage this branch' }));
  await act(async () => {
    resolve({ acceptance: 'temporary_password', generatedTempPassword: 'LatePassword!778' });
  });
  expect(screen.queryByText('LatePassword!778')).toBeNull();
});
