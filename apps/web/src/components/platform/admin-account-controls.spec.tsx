import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminAccountControls } from './admin-account-controls';
const row = {
  userId: 'other',
  fullName: 'Sara',
  status: 'active' as const,
  roles: ['support' as const],
  isRoot: false,
};
afterEach(cleanup);
it('ADM-003: Web admin suspension needs a user-supplied reason and confirmation', () => {
  const save = vi.fn();
  render(<AdminAccountControls row={row} actorId="root" locked={false} save={save} />);
  fireEvent.click(screen.getByText('Suspend Sara'));
  expect((screen.getByText('Review admin change') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Admin change reason for Sara'), {
    target: { value: 'Access suspended during investigation' },
  });
  fireEvent.click(screen.getByText('Review admin change'));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Confirm admin change'));
  expect(save).toHaveBeenCalledWith(
    { change: 'status', status: 'suspended', reason: 'Access suspended during investigation' },
    expect.any(Function),
  );
});
it('ADM-001: Web prevents self-modification and can review multiple Normal Admin roles', () => {
  const save = vi.fn();
  const view = render(
    <AdminAccountControls row={row} actorId="other" locked={false} save={save} />,
  );
  expect(screen.queryByText('Suspend Sara')).toBeNull();
  view.rerender(<AdminAccountControls row={row} actorId="root" locked={false} save={save} />);
  fireEvent.click(screen.getByText('Edit roles for Sara'));
  fireEvent.click(screen.getByLabelText('verification'));
  fireEvent.change(screen.getByLabelText('Admin change reason for Sara'), {
    target: { value: 'Expanded approved review duties' },
  });
  fireEvent.click(screen.getByText('Review admin change'));
  fireEvent.click(screen.getByText('Confirm admin change'));
  expect(save).toHaveBeenCalledWith(
    {
      change: 'roles',
      roles: ['support', 'verification'],
      reason: 'Expanded approved review duties',
    },
    expect.any(Function),
  );
});
