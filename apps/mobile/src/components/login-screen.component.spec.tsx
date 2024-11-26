/// <reference types="jest" />
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AuthFlow } from './auth-flow';
import { runAuth } from '../lib/auth';
import { useLoginForm } from './use-login-form';
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false), back: jest.fn() },
}));
jest.mock('lucide-react-native', () => ({
  Mail: () => null,
  Phone: () => null,
  Eye: () => null,
  EyeOff: () => null,
  LockKeyhole: () => null,
  Lock: () => null,
  House: () => null,
  ArrowRight: () => null,
  ArrowLeft: () => null,
  ShieldCheck: () => null,
}));
jest.mock('./registration-flow', () => ({ RegistrationFlow: () => null }));
jest.mock('../lib/runtime', () => ({ client: {} }));
const mockEstablish = jest.fn();
jest.mock('./providers', () => ({
  useSession: () => ({
    establish: mockEstablish,
    logoutNotice: 'Your session ended. Sign in again.',
  }),
}));
jest.mock('../lib/auth', () => ({ runAuth: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(runAuth).mockResolvedValue(undefined);
});
async function mount(flow: Parameters<typeof AuthFlow>[0]['flow'] = 'login') {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 800 },
        insets: { top: 24, right: 0, bottom: 24, left: 0 },
      }}
    >
      <AuthFlow flow={flow} />
    </SafeAreaProvider>,
  );
}

test('AUTH-C: recovery keeps the existing email request and reset navigation', async () => {
  jest
    .mocked(runAuth)
    .mockResolvedValue('If this account can reset its password, a code will arrive by email.');
  await mount('recover');
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email address'), 'identity@example.test');
  await user.press(screen.getByRole('button', { name: 'Send reset code' }));
  expect(runAuth).toHaveBeenCalledWith(
    'recover',
    { email: 'identity@example.test' },
    expect.objectContaining({ establish: mockEstablish }),
  );
  expect(
    await screen.findByText('If this account can reset its password, a code will arrive by email.'),
  ).toBeVisible();
  await user.press(screen.getByRole('button', { name: 'Enter reset code' }));
  expect(router.push).toHaveBeenCalledWith('/auth/reset');
});

test('AUTH-C: manager activation preserves credentials and independent password visibility', async () => {
  await mount('activate');
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Mobile number'), '+923001234567');
  await user.type(screen.getByLabelText('Temporary password'), 'Temporary phrase');
  await user.type(screen.getByLabelText('New password'), 'Permanent phrase');
  await user.press(screen.getByRole('button', { name: 'Show Temporary password' }));
  expect(screen.getByLabelText('Temporary password')).toHaveProp('secureTextEntry', false);
  expect(screen.getByLabelText('New password')).toHaveProp('secureTextEntry', true);
  await user.press(screen.getByRole('button', { name: 'Activate account' }));
  expect(runAuth).toHaveBeenCalledWith(
    'activate',
    { phone: '+923001234567', tempPassword: 'Temporary phrase', newPassword: 'Permanent phrase' },
    expect.objectContaining({ establish: mockEstablish }),
  );
  expect(router.replace).toHaveBeenCalledWith('/authenticated-entry');
});

test('AUTH-C: six-cell verification remains one accessible paste/autofill field', async () => {
  await mount('verify');
  const input = screen.getByLabelText('Six-digit email code');
  expect(input).toHaveProp('autoComplete', 'one-time-code');
  fireEvent.changeText(input, '12x34567');
  await waitFor(() =>
    expect(screen.getByLabelText('Six-digit email code')).toHaveDisplayValue('123456'),
  );
  expect(screen.getAllByLabelText('Six-digit email code')).toHaveLength(1);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Back' }));
  expect(router.replace).toHaveBeenCalledWith('/auth/login');
});
test.each([
  ['Forgot password?', '/auth/recover'],
  ['Sign up', '/auth/register'],
  ['Continue as guest', '/guest'],
  ['Activate manager account', '/auth/activate'],
])('AUTH-C / CHG-006: redesigned login preserves %s navigation', async (label, path) => {
  await mount();
  await userEvent.setup().press(screen.getByRole('button', { name: label }));
  expect(router.push).toHaveBeenCalledWith(path);
});
test('SEC-001: redesigned login preserves session-ended notice and credential submission', async () => {
  await mount();
  expect(screen.getByText('Your session ended. Sign in again.')).toBeVisible();
  const user = userEvent.setup();
  await user.type(screen.getByTestId('field-email'), 'identity@example.test');
  await user.type(screen.getByLabelText('Password'), 'p'.repeat(14));
  await user.press(screen.getByRole('button', { name: 'Sign In' }));
  expect(runAuth).toHaveBeenCalledWith(
    'login',
    {
      identifier: 'identity@example.test',
      password: 'p'.repeat(14),
    },
    { client: {}, establish: mockEstablish },
  );
  expect(router.replace).toHaveBeenCalledWith('/authenticated-entry');
});

test('AUTH-C: reference login exposes accessible Email/Phone tabs and one active identifier', async () => {
  await mount();
  expect(screen.getByRole('tab', { name: 'Email' })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ selected: true }),
  );
  expect(screen.getByTestId('field-email')).toBeVisible();
  expect(screen.queryByTestId('field-phone')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Verify email' })).toBeNull();
  expect(screen.queryByText('Welcome Back')).toBeNull();
  expect(screen.queryByText('Sign in to your account')).toBeNull();
  expect(screen.getByText('HOSTEL MARKETPLACE')).toBeVisible();
  expect(screen.getByText('OR EXPLORE')).toBeVisible();
  expect(screen.getByPlaceholderText('Enter your email address')).toBeVisible();
});

test.each(['03001234567', '923001234567', '+923001234567'])(
  'AUTH-M-005: phone %s feeds canonical identifier to existing authentication',
  async (phone) => {
    await mount();
    const user = userEvent.setup();
    await user.press(screen.getByRole('tab', { name: 'Phone' }));
    await user.type(screen.getByLabelText('Phone Number'), phone);
    await user.type(screen.getByLabelText('Password'), 'Fixture password');
    await user.press(screen.getByRole('button', { name: 'Sign In' }));
    expect(runAuth).toHaveBeenCalledWith(
      'login',
      {
        identifier: '+923001234567',
        password: 'Fixture password',
      },
      { client: {}, establish: mockEstablish },
    );
    expect(router.replace).toHaveBeenCalledWith('/authenticated-entry');
  },
);
test.each([
  ['email', '', 'Fixture password', 'Enter your email or phone number.'],
  ['email', 'broken', 'Fixture password', 'Enter a valid email address.'],
  ['phone', 'bad', 'Fixture password', 'Enter a valid Pakistani mobile number.'],
  ['email', 'a@example.com', '', 'Password is required.'],
] as const)(
  'SEC-001: inline validation rejects invalid active identifier',
  async (mode, identifier, password, message) => {
    await mount();
    const user = userEvent.setup();
    if (mode === 'phone') await user.press(screen.getByRole('tab', { name: 'Phone' }));
    if (identifier) await user.type(screen.getByTestId('field-' + mode), identifier);
    if (password) await user.type(screen.getByLabelText('Password'), password);
    await user.press(screen.getByRole('button', { name: 'Sign In' }));
    expect(screen.getByText(message)).toBeVisible();
    expect(runAuth).not.toHaveBeenCalled();
  },
);
test('AUTH-C: changing login mode clears the inactive identifier without changing the password', async () => {
  await mount();
  const user = userEvent.setup();
  await user.type(screen.getByTestId('field-email'), 'a@example.com');
  await user.type(screen.getByLabelText('Password'), 'Fixture password');
  await user.press(screen.getByRole('tab', { name: 'Phone' }));
  expect(screen.getByRole('tab', { name: 'Phone' })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ selected: true }),
  );
  expect(screen.queryByTestId('field-email')).toBeNull();
  expect(screen.getByTestId('field-phone')).toHaveProp('value', '');
  expect(screen.getByLabelText('Password')).toHaveProp('value', 'Fixture password');
  await user.type(screen.getByTestId('field-phone'), '03001234567');
  await user.press(screen.getByRole('button', { name: 'Sign In' }));
  expect(runAuth).toHaveBeenCalledWith(
    'login',
    {
      identifier: '+923001234567',
      password: 'Fixture password',
    },
    { client: {}, establish: mockEstablish },
  );
});
test('SEC-001: password is secure by default and visibility is accessible', async () => {
  await mount();
  expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);
  await user.press(screen.getByRole('button', { name: 'Hide password' }));
  expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
});
test('SEC-001: loading blocks duplicate submissions and input editing', async () => {
  let resolve: (() => void) | undefined;
  jest.mocked(runAuth).mockImplementation(
    () =>
      new Promise<undefined>((done) => {
        resolve = () => done(undefined);
      }),
  );
  await mount();
  const user = userEvent.setup();
  await user.type(screen.getByTestId('field-email'), 'a@example.com');
  await user.type(screen.getByLabelText('Password'), 'Fixture password');
  const button = screen.getByRole('button', { name: 'Sign In' });
  await user.press(button);
  await user.press(button);
  expect(runAuth).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeDisabled();
  expect(screen.getByTestId('field-email')).toHaveProp('editable', false);
  expect(screen.getByRole('tab', { name: 'Phone' })).toBeDisabled();
  expect(screen.getByText('Signing in…')).toBeVisible();
  await act(async () => {
    resolve?.();
  });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled());
});
test('SEC-003: raw authentication failure never appears and retry remains possible', async () => {
  jest.mocked(runAuth).mockRejectedValue(new Error('private token fixture must stay hidden'));
  await mount();
  const user = userEvent.setup();
  await user.type(screen.getByTestId('field-email'), 'a@example.com');
  await user.type(screen.getByLabelText('Password'), 'Fixture password');
  await user.press(screen.getByRole('button', { name: 'Sign In' }));
  expect(await screen.findByText('Something went wrong on this screen. Try again.')).toBeVisible();
  expect(screen.queryByText('private token fixture must stay hidden')).toBeNull();
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
});
test('AUTH-C / SEC-001: keyboard semantics and prohibited controls match the brief', async () => {
  await mount();
  expect(screen.getByTestId('field-email')).toHaveProp('keyboardType', 'email-address');
  expect(screen.getByTestId('field-email')).toHaveProp('autoCapitalize', 'none');
  await userEvent.setup().press(screen.getByRole('tab', { name: 'Phone' }));
  expect(screen.getByLabelText('Phone Number')).toHaveProp('keyboardType', 'phone-pad');
  expect(screen.getByLabelText('Password')).toHaveProp('autoComplete', 'current-password');
  for (const text of [
    'CNIC',
    'Google',
    'Apple',
    'or continue with',
    'Hostel Management',
    'Remember me',
  ])
    expect(screen.queryByText(text)).toBeNull();
  expect(screen.queryAllByRole('switch')).toHaveLength(0);
  expect(screen.getAllByRole('tab')).toHaveLength(2);
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
});

test('SEC-001: synchronous login lock rejects a second call before a re-render', async () => {
  let resolve: (() => void) | undefined;
  const submit = jest.fn(
    () =>
      new Promise<string>((done) => {
        resolve = () => done('');
      }),
  );
  const hook = await renderHook(() => useLoginForm(submit));
  await act(async () => {
    hook.result.current.change('email', 'a@example.com');
    hook.result.current.change('password', 'Fixture password');
  });
  let first: Promise<void> | undefined;
  await act(async () => {
    first = hook.result.current.signIn();
    void hook.result.current.signIn();
  });
  expect(submit).toHaveBeenCalledTimes(1);
  expect(hook.result.current.loading).toBe(true);
  await act(async () => {
    resolve?.();
    await first;
  });
  expect(hook.result.current.loading).toBe(false);
});
