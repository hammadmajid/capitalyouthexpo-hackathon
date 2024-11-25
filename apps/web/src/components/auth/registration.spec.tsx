import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RegistrationForm } from './registration';
import {
  startRegistration,
  verifyRegistration,
  completeRegistration,
} from '../../lib/registration';
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../../lib/enter-app', () => ({ enterApp: replace }));
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('../../lib/registration', () => ({
  startRegistration: vi.fn(),
  verifyRegistration: vi.fn(),
  completeRegistration: vi.fn(),
}));
const profile = {
  user: {
    id: randomUUID(),
    fullName: '',
    email: 'identity@example.test',
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: true, owner: false, managerOf: [], admin: null },
};
const setupToken = 's'.repeat(43);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(startRegistration).mockResolvedValue('identity@example.test');
  vi.mocked(verifyRegistration).mockResolvedValue({ next: 'password', setupToken, expiresIn: 600 });
  vi.mocked(completeRegistration).mockResolvedValue(profile);
});
afterEach(cleanup);
function mount(returnPath?: string) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={cache}>
      <RegistrationForm returnPath={returnPath} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), cache };
}
function enter(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
}
async function emailStep(user: ReturnType<typeof userEvent.setup>) {
  enter('Email address', 'identity@example.test');
  await user.click(screen.getByRole('button', { name: 'Send email code' }));
  await screen.findByRole('heading', { name: 'Verify your email' });
}
it('AUTH-C CHG-006: actual web signup starts with email only; OTP never creates session state before permanent password', async () => {
  const { user, cache } = mount('/app/customer');
  const write = vi.spyOn(cache, 'setQueryData');
  expect(screen.queryByLabelText('Password')).toBeNull();
  expect(screen.queryByLabelText('CNIC number')).toBeNull();
  await emailStep(user);
  expect(cache.getQueryData(['session'])).toBeUndefined();
  expect(completeRegistration).not.toHaveBeenCalled();
  enter('Six-digit email code', '123456');
  await user.click(screen.getByRole('button', { name: 'Verify email' }));
  await screen.findByRole('heading', { name: 'Set your password' });
  expect(cache.getQueryData(['session'])).toBeUndefined();
  enter('Password', 'Permanent private phrase');
  enter('Confirm password', 'Permanent private phrase');
  await user.click(screen.getByRole('button', { name: 'Set password' }));
  expect(completeRegistration).toHaveBeenCalledWith({}, setupToken, {
    password: 'Permanent private phrase',
    confirmPassword: 'Permanent private phrase',
  });
  expect(write).toHaveBeenCalledExactlyOnceWith(['session'], profile);
  expect(replace).toHaveBeenCalledWith('/app/customer');
  expect(document.body.textContent).not.toContain(setupToken);
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});
it('AUTH-C SEC: existing permanent identity preserves a validated destination on the Login link', async () => {
  vi.mocked(verifyRegistration).mockResolvedValue({ next: 'login' });
  const { user } = mount('/app/owner');
  await emailStep(user);
  enter('Six-digit email code', '123456');
  await user.click(screen.getByRole('button', { name: 'Verify email' }));
  expect((await screen.findByRole('link', { name: /^Sign in$/ })).getAttribute('href')).toBe(
    '/login?returnTo=%2Fapp%2Fowner',
  );
  expect(completeRegistration).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});
it('SEC: verification failure cannot expose provider details or enter password setup', async () => {
  vi.mocked(verifyRegistration).mockRejectedValueOnce(new Error('private OTP provider value'));
  const { user } = mount();
  await emailStep(user);
  enter('Six-digit email code', '123456');
  await user.click(screen.getByRole('button', { name: 'Verify email' }));
  await screen.findByRole('alert');
  expect(document.body.textContent).not.toContain('private OTP provider value');
  expect(screen.queryByLabelText('Password')).toBeNull();
  expect(replace).not.toHaveBeenCalled();
});
it('AUTH-C SEC: resend clears the old code and restart discards password setup without storage', async () => {
  const { user } = mount();
  await emailStep(user);
  enter('Six-digit email code', '123456');
  await user.click(screen.getByRole('button', { name: 'Send another code' }));
  await screen.findByRole('status');
  expect((screen.getByLabelText('Six-digit email code') as HTMLInputElement).value).toBe('');
  enter('Six-digit email code', '654321');
  await user.click(screen.getByRole('button', { name: 'Verify email' }));
  await screen.findByRole('heading', { name: 'Set your password' });
  await user.click(screen.getByRole('button', { name: 'Use another email' }));
  await screen.findByLabelText('Email address');
  expect(screen.queryByLabelText('Password')).toBeNull();
  expect(completeRegistration).not.toHaveBeenCalled();
});
it('SEC: untrusted return inputs are not copied into signup Login links', () => {
  mount('https://attacker.example/private');
  expect(
    screen.getByRole('link', { name: 'Already have an account? Sign in' }).getAttribute('href'),
  ).toBe('/login');
});
