/// <reference types="jest" />
import { render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { RegistrationFlow } from './registration-flow';
import { startRegistration, verifyRegistration, completeRegistration } from '../lib/registration';
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), canGoBack: jest.fn(() => false), back: jest.fn() },
}));
jest.mock('../lib/runtime', () => ({ client: {} }));
const mockEstablish = jest.fn();
jest.mock('./providers', () => ({ useSession: () => ({ establish: mockEstablish }) }));
jest.mock('../lib/registration', () => ({
  startRegistration: jest.fn(),
  verifyRegistration: jest.fn(),
  completeRegistration: jest.fn(),
}));
const setupToken = 's'.repeat(43);
const mount = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 400, height: 900 },
        insets: { top: 24, right: 0, bottom: 24, left: 0 },
      }}
    >
      <RegistrationFlow />
    </SafeAreaProvider>,
  );
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(startRegistration).mockResolvedValue('identity@example.test');
  jest
    .mocked(verifyRegistration)
    .mockResolvedValue({ next: 'password', setupToken, expiresIn: 600 });
  jest.mocked(completeRegistration).mockResolvedValue(undefined);
});
async function emailStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email address'), 'identity@example.test');
  await user.press(screen.getByRole('button', { name: 'Send email code' }));
  expect(await screen.findByText('Verify your email')).toBeVisible();
}
test('AUTH-C CHG-006: actual native form starts with only email and establishes nothing until OTP and permanent password', async () => {
  await mount();
  const user = userEvent.setup();
  expect(screen.queryByLabelText('Password')).toBeNull();
  expect(screen.queryByLabelText('CNIC number')).toBeNull();
  expect(screen.queryByLabelText('Mobile number (+92)')).toBeNull();
  await emailStep(user);
  expect(screen.getByText('id***@example.test')).toBeVisible();
  expect(screen.queryByText('identity@example.test')).toBeNull();
  expect(completeRegistration).not.toHaveBeenCalled();
  expect(mockEstablish).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Six-digit email code'), '123456');
  await user.press(screen.getByRole('button', { name: 'Verify email' }));
  expect(await screen.findByText('Set your password')).toBeVisible();
  expect(verifyRegistration).toHaveBeenCalledWith({}, 'identity@example.test', '123456');
  expect(completeRegistration).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Password'), 'Permanent private phrase');
  await user.type(screen.getByLabelText('Confirm password'), 'Permanent private phrase');
  await user.press(screen.getByRole('button', { name: 'Set password' }));
  expect(completeRegistration).toHaveBeenCalledWith(
    { client: {}, establish: mockEstablish },
    setupToken,
    { password: 'Permanent private phrase', confirmPassword: 'Permanent private phrase' },
  );
  expect(router.replace).toHaveBeenCalledWith('/customer-profile');
});
test('AUTH-C: existing permanent identity returns to Login without ordinary session setup', async () => {
  jest.mocked(verifyRegistration).mockResolvedValue({ next: 'login' });
  await mount();
  const user = userEvent.setup();
  await emailStep(user);
  await user.type(screen.getByLabelText('Six-digit email code'), '123456');
  await user.press(screen.getByRole('button', { name: 'Verify email' }));
  expect(
    await screen.findByText('This account already has a password. Sign in to continue.'),
  ).toBeVisible();
  expect(completeRegistration).not.toHaveBeenCalled();
  await user.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(router.replace).toHaveBeenCalledWith('/auth/login');
});
test('SEC: failed verification shows only a safe alert and cannot enter password or account screens', async () => {
  jest.mocked(verifyRegistration).mockRejectedValue(new Error('private OTP provider value'));
  await mount();
  const user = userEvent.setup();
  await emailStep(user);
  await user.type(screen.getByLabelText('Six-digit email code'), '123456');
  await user.press(screen.getByRole('button', { name: 'Verify email' }));
  expect(await screen.findByText('Something went wrong on this screen. Try again.')).toBeVisible();
  expect(screen.queryByText('private OTP provider value')).toBeNull();
  expect(screen.queryByText('Set your password')).toBeNull();
  expect(completeRegistration).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
test('AUTH-C SEC: resend clears the old entered code; restarting discards the setup capability', async () => {
  await mount();
  const user = userEvent.setup();
  await emailStep(user);
  await user.type(screen.getByLabelText('Six-digit email code'), '123456');
  await user.press(screen.getByRole('button', { name: 'Send another code' }));
  expect(await screen.findByText('A new email code has been requested.')).toBeVisible();
  expect(screen.getByLabelText('Six-digit email code')).toHaveDisplayValue('');
  await user.type(screen.getByLabelText('Six-digit email code'), '654321');
  await user.press(screen.getByRole('button', { name: 'Verify email' }));
  expect(await screen.findByText('Set your password')).toBeVisible();
  await user.press(screen.getByRole('button', { name: 'Use another email' }));
  expect(await screen.findByText('Create your account')).toBeVisible();
  expect(screen.queryByLabelText('Password')).toBeNull();
  expect(completeRegistration).not.toHaveBeenCalled();
});
test('SEC: resend failure stays on verification and never exposes provider text', async () => {
  await mount();
  const user = userEvent.setup();
  await emailStep(user);
  jest.mocked(startRegistration).mockRejectedValueOnce(new Error('private email provider value'));
  await user.press(screen.getByRole('button', { name: 'Send another code' }));
  expect(await screen.findByText('Something went wrong on this screen. Try again.')).toBeVisible();
  expect(screen.queryByText('private email provider value')).toBeNull();
  expect(screen.getByText('Verify your email')).toBeVisible();
});
