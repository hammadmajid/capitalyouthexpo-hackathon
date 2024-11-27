/// <reference types="jest" />
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { submitBookingDocument } from '@hsm/api-client';
import { actorClient, client } from '../../lib/runtime';
import { BookingEvidencePicker } from './booking-evidence';
jest.mock('../../lib/runtime', () => ({ client: {}, actorClient: jest.fn() }));
jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => '019a1234-1234-7123-8123-' + String(++sequence).padStart(12, '0') };
});
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  submitBookingDocument: jest.fn(),
}));
jest.mock('../private-file-picker', () => ({
  PrivateFilePicker: ({ onReady }: { onReady: (id: string | undefined) => void }) => {
    const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose test evidence"
        onPress={() => onReady('019a1234-1234-7123-8123-123456789abc')}
      >
        <Text>Choose evidence</Text>
      </Pressable>
    );
  },
}));
const fileId = '019a1234-1234-7123-8123-123456789abc';
let cache: QueryClient;
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(actorClient).mockResolvedValue(client);
  cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  jest.mocked(submitBookingDocument).mockResolvedValue({
    id: fileId,
    branchId: fileId,
    bookingId: null,
    kind: 'student_id',
    fileId,
    state: 'pending',
    consumedAt: null,
    createdAt: '2026-10-15T10:00:00Z',
    reviewedAt: null,
    rejectionCode: null,
  });
});
afterEach(() => cache.clear());
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
test('CHG-008 / SEC-003: selecting a clean file cannot share it without explicit consent', async () => {
  const onReady = jest.fn(),
    onBusy = jest.fn();
  const props = {
    actorId: fileId,
    branchId: fileId,
    kind: 'student_id' as const,
    disabled: false,
    onReady,
    onBusy,
  };
  const mounted = await render(<BookingEvidencePicker {...props} consent={false} />, { wrapper });
  await userEvent.setup().press(screen.getByRole('button', { name: 'Choose test evidence' }));
  expect(screen.getByRole('button', { name: 'Share Student ID with Owner' })).toBeDisabled();
  expect(submitBookingDocument).not.toHaveBeenCalled();
  expect(onReady).toHaveBeenLastCalledWith(undefined);
  await mounted.rerender(<BookingEvidencePicker {...props} consent />);
  await userEvent
    .setup()
    .press(screen.getByRole('button', { name: 'Share Student ID with Owner' }));
  await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(fileId));
  expect(submitBookingDocument).toHaveBeenCalledWith(
    {},
    fileId,
    { kind: 'student_id', fileId, shareWithOwner: true },
    expect.any(String),
  );
  expect(screen.queryByText(fileId)).toBeNull();
  expect(
    screen.getByText('Shared privately with this hostel Owner for verification.'),
  ).toBeVisible();
  await waitFor(() => expect(onBusy.mock.calls).toEqual([[true], [false]]));
});

test('SEC-003 / CHG-008: a previous account document cannot be shared under replacement credentials', async () => {
  jest.mocked(actorClient).mockRejectedValue(new Error('Account changed'));
  const onReady = jest.fn();
  await render(
    <BookingEvidencePicker
      actorId={fileId}
      branchId={fileId}
      kind="student_id"
      consent
      disabled={false}
      onReady={onReady}
      onBusy={jest.fn()}
    />,
    { wrapper },
  );
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Choose test evidence' }));
  await user.press(screen.getByRole('button', { name: 'Share Student ID with Owner' }));
  await screen.findByText('Something went wrong on this screen. Try again.');
  expect(submitBookingDocument).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalledWith(fileId);
});
