import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  requestEmailAssociation,
  verifyEmailAssociation,
  checkEmailAssociation,
} from '@hsm/api-client';
import { EmailAssociation } from './email-association';
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  requestEmailAssociation: vi.fn(),
  verifyEmailAssociation: vi.fn(),
  checkEmailAssociation: vi.fn(),
}));
const id = '550e8400-e29b-41d4-a716-446655440000';
const profile = {
  user: {
    id,
    fullName: 'Manager',
    email: 'manager@example.test',
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: false, owner: false, managerOf: [], admin: null },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestEmailAssociation).mockResolvedValue('manager@example.test');
  vi.mocked(verifyEmailAssociation).mockResolvedValue(profile);
  vi.mocked(checkEmailAssociation).mockResolvedValue(profile);
});
afterEach(cleanup);
function mount() {
  const onVerified = vi.fn().mockResolvedValue(undefined);
  const q = render(<EmailAssociation userId={id} onVerified={onVerified} />);
  return { ...q, onVerified };
}
async function request() {
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'manager@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'Permanent manager phrase' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
  await screen.findByLabelText('Email verification code');
}
it('AUTH-M CHG-006: actual email association form clears password before proof and completes on the original identity', async () => {
  const q = mount();
  await request();
  expect(screen.queryByLabelText('Current password')).toBeNull();
  expect(requestEmailAssociation).toHaveBeenCalledWith(
    {},
    { email: 'manager@example.test', currentPassword: 'Permanent manager phrase' },
  );
  fireEvent.change(screen.getByLabelText('Email verification code'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
  await waitFor(() => expect(q.onVerified).toHaveBeenCalledWith(profile));
  expect(verifyEmailAssociation).toHaveBeenCalledWith({}, id, 'manager@example.test', '123456');
});
it('SEC: association request failure remains safe and does not enter proof', async () => {
  const q = mount();
  vi.mocked(requestEmailAssociation).mockRejectedValueOnce(
    new Error('Private provider credential'),
  );
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'manager@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'Permanent manager phrase' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
  expect((await screen.findByRole('alert')).textContent).not.toContain(
    'Private provider credential',
  );
  expect(screen.queryByLabelText('Email verification code')).toBeNull();
  expect(q.onVerified).not.toHaveBeenCalled();
});
it('SEC: lost-response recovery reads fresh self profile and restart discards proof fields', async () => {
  const q = mount();
  await request();
  fireEvent.change(screen.getByLabelText('Email verification code'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check verification status' }));
  await waitFor(() => expect(q.onVerified).toHaveBeenCalledWith(profile));
  expect(checkEmailAssociation).toHaveBeenCalledWith({}, id, 'manager@example.test');
  expect(verifyEmailAssociation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Request a new code' }));
  expect(screen.queryByLabelText('Email verification code')).toBeNull();
  expect(screen.getByLabelText<HTMLInputElement>('Current password').value).toBe('');
  expect(screen.getByLabelText<HTMLInputElement>('Email address').value).toBe('');
});
it('SEC: failed status reconciliation exposes safe text and cannot complete association', async () => {
  const q = mount();
  await request();
  vi.mocked(checkEmailAssociation).mockRejectedValueOnce(new Error('Private identity detail'));
  fireEvent.click(screen.getByRole('button', { name: 'Check verification status' }));
  expect((await screen.findByRole('alert')).textContent).not.toContain('Private identity detail');
  expect(q.onVerified).not.toHaveBeenCalled();
});

it('SEC: an unmounted association cannot apply a delayed verification to another session', async () => {
  const q = mount();
  await request();
  let resolve: (value: typeof profile) => void = () => undefined;
  vi.mocked(verifyEmailAssociation).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.change(screen.getByLabelText('Email verification code'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
  await waitFor(() => expect(verifyEmailAssociation).toHaveBeenCalled());
  q.unmount();
  resolve(profile);
  await Promise.resolve();
  expect(q.onVerified).not.toHaveBeenCalled();
});
