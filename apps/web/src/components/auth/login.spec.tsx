import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginForm } from './login';
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../../lib/enter-app', () => ({ enterApp: replace }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function form(returnPath?: string) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <LoginForm returnPath={returnPath} />
    </QueryClientProvider>,
  );
  return { cache, user: userEvent.setup() };
}
it('AUTH-C: invalid login fields show labels and errors before making a request', async () => {
  const transport = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', transport);
  const { user } = form();
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Enter your email or mobile number.')).toBeDefined();
  expect(screen.getByLabelText('Email or mobile number').getAttribute('aria-invalid')).toBe('true');
  expect(transport).not.toHaveBeenCalled();
});
it('SEC-003: login rejection displays safe text without backend details', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          type: 'https://example.com/problems/auth',
          title: 'PRIVATE_MARKER',
          status: 401,
          code: 'INVALID_CREDENTIALS',
          detail: 'PRIVATE_MARKER',
          traceId: 'trace',
        },
        { status: 401 },
      ),
    ),
  );
  const { user } = form();
  await user.type(screen.getByLabelText('Email or mobile number'), 'person@example.test');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'Public fixture phrase');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Check your sign-in details and try again.',
  );
  expect(document.body.textContent).not.toContain('PRIVATE_MARKER');
  expect(replace).not.toHaveBeenCalled();
});
it('AUTH-C / SEC-001: successful login caches only the live profile and clears password input', async () => {
  const profile = {
    user: {
      id: randomUUID(),
      fullName: 'Browser Identity',
      email: null,
      emailVerified: true,
      cnicLast4: null,
    },
    capabilities: { customer: true, owner: false, managerOf: [], admin: null },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...profile,
        client: 'web',
        expiresIn: 600,
        sessionId: randomUUID(),
      }),
    ),
  );
  const { cache, user } = form();
  await user.type(screen.getByLabelText('Email or mobile number'), 'person@example.test');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'Public fixture phrase');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/app'));
  expect(cache.getQueryData(['session'])).toEqual(profile);
  expect((screen.getByLabelText('Password', { exact: true }) as HTMLInputElement).value).toBe('');
  expect(cache.getMutationCache().getAll()).toHaveLength(0);
});

it.each(['/app/security', '/app/customer'])(
  'AUTH-C / CHG-006: successful login resumes the safe intended destination %s',
  async (path) => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          user: {
            id: randomUUID(),
            fullName: 'Returning Identity',
            email: null,
            emailVerified: true,
            cnicLast4: null,
          },
          capabilities: { customer: true, owner: false, managerOf: [], admin: null },
          client: 'web',
          expiresIn: 600,
          sessionId: randomUUID(),
        }),
      ),
    );
    const { user } = form(path);
    await user.type(screen.getByLabelText('Email or mobile number'), 'person@example.test');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Public fixture phrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(path));
  },
);
