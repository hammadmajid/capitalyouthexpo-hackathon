import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BookingUpfront } from '@hsm/contracts';
import { BookingUpfrontReview } from './booking-upfront-review';
import { BookingUpfrontCustomer } from './booking-upfront-customer';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const at = '2026-10-25T10:00:00.000Z',
  actorId = randomUUID(),
  branchId = randomUUID(),
  bookingId = randomUUID(),
  proofId = randomUUID();
const proof = {
  id: proofId,
  state: 'submitted' as const,
  amountPaisa: 1800000,
  method: 'bank_transfer' as const,
  paidOn: '2026-10-25',
  reference: 'TRX-1',
  submittedAt: at,
  reviewedAt: null,
  reviewReason: null,
};
const pending: BookingUpfront = {
  requirement: 'first_rent',
  amountPaisa: 1800000,
  status: 'verification_pending',
  approvedAt: at,
  proof,
};
function wrap(node: React.ReactNode) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>);
}
function capture(response: unknown, status = 200) {
  const requests: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request.clone());
      return Response.json(response, { status });
    }),
  );
  return requests;
}
it('ACC-004: reviewers without payment grants see no verification controls', () => {
  wrap(
    <BookingUpfrontReview
      actorId={actorId}
      branchId={branchId}
      bookingId={bookingId}
      upfront={pending}
      canReview={false}
    />,
  );
  expect(screen.queryByRole('button', { name: /Verify payment/ })).toBeNull();
  expect(
    screen.getByText(/requires booking, payment-record and finance-view grants/),
  ).toBeDefined();
});
it('ACC-004: rejection requires a reason and sends the exact reviewed proof decision', async () => {
  const requests = capture({});
  wrap(
    <BookingUpfrontReview
      actorId={actorId}
      branchId={branchId}
      bookingId={bookingId}
      upfront={pending}
      canReview
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reject proof' }));
  const submit = screen.getByRole('button', { name: 'Reject payment proof' });
  expect(submit.hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Reason the proof was not accepted'), {
    target: { value: 'Not received' },
  });
  fireEvent.click(submit);
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(new URL(requests[0]?.url ?? '').pathname).toBe(
    `/api/v1/branches/${branchId}/bookings/${bookingId}/payment-proofs/${proofId}/review`,
  );
  expect(await requests[0]?.json()).toEqual({ decision: 'reject', reason: 'Not received' });
});
it('BKG-007/008: customers see instructions only while payment is requested and submit the exact amount', async () => {
  const requests = capture({ branchId, data: [] });
  wrap(
    <BookingUpfrontCustomer
      actorId={actorId}
      bookingId={bookingId}
      upfront={{ ...pending, status: 'awaiting_payment', proof: null }}
      open
    />,
  );
  expect(await screen.findByText(/has not published payment instructions/)).toBeDefined();
  expect(new URL(requests[0]?.url ?? '').pathname).toBe(
    `/api/v1/me/bookings/${bookingId}/payment-instructions`,
  );
  expect(
    screen.getByRole('button', { name: 'Submit payment proof' }).hasAttribute('disabled'),
  ).toBe(true);
  cleanup();
  wrap(<BookingUpfrontCustomer actorId={actorId} bookingId={bookingId} upfront={pending} open />);
  expect(screen.queryByRole('button', { name: 'Submit payment proof' })).toBeNull();
  expect(screen.getByText(/awaiting hostel verification/)).toBeDefined();
});
