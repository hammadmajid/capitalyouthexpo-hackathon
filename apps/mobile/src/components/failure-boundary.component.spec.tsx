/// <reference types="jest" />
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import { FailureBoundary } from './failure-boundary';
import { reportMobileFailure } from '../observability/binding';
jest.mock('lucide-react-native', () => ({ Building2: () => null }));
jest.mock('../observability/binding', () => ({ reportMobileFailure: jest.fn() }));
let throwing = false;
function Content() {
  if (throwing) throw new Error('private-password private-otp private-cnic');
  return <Text>Application content</Text>;
}
afterEach(() => {
  throwing = false;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
test('SEC-003: healthy app content remains unchanged', async () => {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 800 },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      }}
    >
      <FailureBoundary>
        <Content />
      </FailureBoundary>
    </SafeAreaProvider>,
  );
  expect(screen.getByText('Application content')).toBeTruthy();
  expect(reportMobileFailure).not.toHaveBeenCalled();
});
test('SEC-003: component errors report no private values and permit retry', async () => {
  // React development diagnostics are suppressed only in this intentional-error unit fixture.
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  throwing = true;
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 800 },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      }}
    >
      <FailureBoundary>
        <Content />
      </FailureBoundary>
    </SafeAreaProvider>,
  );
  expect(screen.getByText('This screen stopped')).toBeTruthy();
  expect(screen.queryByText(/private-password/)).toBeNull();
  expect(jest.mocked(reportMobileFailure).mock.calls).toEqual([[]]);
  throwing = false;
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByText('Application content')).toBeTruthy();
});
