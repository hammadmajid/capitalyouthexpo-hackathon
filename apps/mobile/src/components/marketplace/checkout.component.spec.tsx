/// <reference types="jest" />
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import { ownBookingDocuments } from '@hsm/api-client';
import { bookingQuoteSnapshotSchema } from '@hsm/contracts';
import { karachiDateTime } from '../../lib/karachi-time';
import { MarketplaceCheckout } from './checkout';
jest.mock('../../lib/runtime', () => ({ client: {}, actorClient: jest.fn(async () => ({})) }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  ownBookingDocuments: jest.fn(),
}));
jest.mock('./booking-evidence', () => ({
  ...jest.requireActual<typeof import('./booking-evidence')>('./booking-evidence'),
  BookingEvidencePicker: () => null,
  evidenceLabels: { student_id: 'Student ID' },
}));
const actorId = '019a1234-1234-7123-8123-123456789abc';
const branchId = actorId,
  roomId = actorId,
  policyId = actorId;
const quoteInput = {
  target: { kind: 'room' as const, roomId },
  range: { moveInDate: '2026-10-15', moveOutDate: '2026-11-15' },
};
const quote = bookingQuoteSnapshotSchema.parse({
  version: 1,
  currency: 'PKR',
  ...quoteInput,
  listing: {
    hostelName: 'Fixture hostel',
    branchName: 'Fixture branch',
    roomTypeName: 'Two beds',
    roomLabel: '101',
    bedLabel: null,
  },
  price: { monthlyRentPaisa: 1800001, depositPaisa: 0, fees: [] },
  policyVersion: policyId,
  policyLineage: [policyId],
  quotedAt: '2026-10-14T12:00:00Z',
  policy: {
    bookingMode: 'request',
    holdSeconds: 600,
    requestExpirySeconds: 3600,
    requestReservesInventory: true,
    minimumStayDays: 1,
    maximumStayDays: 'unlimited',
    minimumAdvanceDays: 0,
    maximumAdvanceDays: 365,
    customerSelectsInventory: true,
    cancellationAllowed: true,
    cancellationCutoffHours: 0,
    allowedStayUnits: ['day', 'week', 'month'],
    requiredDocuments: [],
    allowEvidenceReuse: true,
    documentReviewRequired: false,
  },
});
const mockCheckout = {
  hold: { isPending: false, isError: false, error: null, data: undefined, mutate: jest.fn() },
  book: { isPending: false, isError: false, error: null, mutate: jest.fn(), reset: jest.fn() },
  result: undefined,
};
jest.mock('./use-checkout', () => ({ useCheckout: () => mockCheckout }));
let cache: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockCheckout.book.isPending = false;
  jest.mocked(ownBookingDocuments).mockResolvedValue({ data: [], nextCursor: null });
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => cache.clear());
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
const noDocuments = bookingQuoteSnapshotSchema.parse({
  ...quote,
  policy: { ...quote.policy, requiredDocuments: [], bookingMode: 'instant' },
});
test('BKG-001: explicit consent is required before a hold or booking command', async () => {
  await render(<MarketplaceCheckout actorId={actorId} branchId={branchId} quote={noDocuments} />, {
    wrapper,
  });
  expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Temporarily hold this inventory' })).toBeDisabled();
  await userEvent.setup().press(screen.getByRole('checkbox'));
  await userEvent.setup().press(screen.getByRole('button', { name: 'Confirm booking' }));
  expect(mockCheckout.book.mutate).toHaveBeenCalledWith(
    { quote: noDocuments, documents: [] },
    expect.any(Object),
  );
  expect(screen.queryByText('Booking confirmed')).toBeNull();
});
test('SEC-003: account change clears booking consent before another account can submit', async () => {
  const mounted = await render(
    <MarketplaceCheckout actorId={actorId} branchId={branchId} quote={noDocuments} />,
    { wrapper },
  );
  await userEvent.setup().press(screen.getByRole('checkbox'));
  expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeEnabled();
  await mounted.rerender(
    <MarketplaceCheckout actorId={branchId + '0'} branchId={branchId} quote={noDocuments} />,
  );
  expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeDisabled();
});
test('BKG-001: a pending server request prevents duplicate submission', async () => {
  mockCheckout.book.isPending = true;
  await render(<MarketplaceCheckout actorId={actorId} branchId={branchId} quote={noDocuments} />, {
    wrapper,
  });
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Submitting booking...' })).toBeDisabled();
  expect(mockCheckout.book.mutate).not.toHaveBeenCalled();
});

test('BKG-001 / SEC-003: accepted private evidence can be selected only after consent and is submitted without exposing its ID', async () => {
  const document = {
    id: actorId,
    branchId,
    fileId: actorId,
    bookingId: null,
    kind: 'student_id' as const,
    state: 'accepted' as const,
    consumedAt: null,
    createdAt: '2026-10-15T10:00:00Z',
    reviewedAt: '2026-10-15T11:00:00Z',
    rejectionCode: null,
  };
  jest.mocked(ownBookingDocuments).mockResolvedValue({ data: [document], nextCursor: null });
  const required = bookingQuoteSnapshotSchema.parse({
    ...noDocuments,
    policy: {
      ...noDocuments.policy,
      requiredDocuments: ['student_id'],
      documentReviewRequired: true,
      allowEvidenceReuse: false,
    },
  });
  await render(<MarketplaceCheckout actorId={actorId} branchId={branchId} quote={required} />, {
    wrapper,
  });
  const choice = await screen.findByRole('button', {
    name: 'Use accepted Student ID from ' + karachiDateTime(document.createdAt),
  });
  expect(choice).toBeDisabled();
  await userEvent.setup().press(screen.getByRole('checkbox'));
  await userEvent.setup().press(choice);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Confirm booking' }));
  expect(mockCheckout.book.mutate).toHaveBeenCalledWith(
    { quote: required, documents: [{ kind: 'student_id', fileId: actorId }] },
    expect.any(Object),
  );
  expect(screen.queryByText(actorId)).toBeNull();
});

test('AUTH-C-005 / SEC-003: checkout sends a private address and clears it when the account changes', async () => {
  const mounted = await render(
    <MarketplaceCheckout actorId={actorId} branchId={branchId} quote={noDocuments} />,
    { wrapper },
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Private permanent address'), 'House 12, Islamabad');
  await user.press(screen.getByRole('checkbox'));
  await user.press(screen.getByRole('button', { name: 'Confirm booking' }));
  expect(mockCheckout.book.mutate).toHaveBeenCalledWith(
    { quote: noDocuments, documents: [], permanentAddress: 'House 12, Islamabad' },
    expect.any(Object),
  );
  await mounted.rerender(
    <MarketplaceCheckout actorId={branchId + '0'} branchId={branchId} quote={noDocuments} />,
  );
  expect(screen.getByLabelText('Private permanent address')).toHaveProp('value', '');
  expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeDisabled();
});
