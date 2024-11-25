import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BookingCheckIn, checkInBilling } from './booking-check-in';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const branchId = randomUUID(),
  bookingId = randomUUID(),
  policyVersionId = randomUUID();
const terms = {
  policyVersionId,
  currency: 'PKR',
  fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 300000 }],
  catalog: [],
  rentAmountPaisa: 1800000,
  depositPaisa: 500000,
  policy: {
    cycle: { kind: 'calendar_month', dueDay: 5 },
    proration: { kind: 'full_period' },
    graceDays: 0,
    lateCharge: { kind: 'disabled' },
    noticeDays: 15,
    earlyCheckout: { kind: 'manual' },
    allowOpenEnded: false,
    customCharges: 'disabled',
  },
};
const result = {
  branchId,
  bookingId,
  stayId: randomUUID(),
  residentId: randomUUID(),
  agreementId: randomUUID(),
  assignmentId: randomUUID(),
  state: 'active',
  version: 1,
};
it('RENT-003: initial billing starts rent and every disclosed fee at the first period', () => {
  expect(checkInBilling(terms as never)).toEqual([
    { item: 'rent', cadence: 'periodic', periodIndex: 0 },
    { item: 'mess', cadence: 'periodic', periodIndex: 0 },
  ]);
});
it('STAY-001 / ACC-001: check-in reviews captured terms and retries with the same key', async () => {
  const requests: Request[] = [];
  let fail = true;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request.clone());
      if (request.method === 'GET')
        // CHG-054: the preview says whether the customer's account already holds a CNIC.
        return Response.json({
          branchId,
          bookingId,
          terms: { ...terms, fees: [] },
          cnicOnFile: true,
        });
      if (fail) {
        fail = false;
        return new Response('upstream', { status: 503 });
      }
      return Response.json(result, { status: 201 });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BookingCheckIn actorId={randomUUID()} branchId={branchId} bookingId={bookingId} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Check in resident' }));
  expect(await screen.findByText('Agreed monthly rent: PKR 18,000')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm check-in' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm check-in' }));
  expect(await screen.findByText(/Resident checked in/)).toBeDefined();
  const posts = requests.filter((request) => request.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[0]?.headers.get('Idempotency-Key')).toBe(posts[1]?.headers.get('Idempotency-Key'));
  await waitFor(async () =>
    expect(await posts[1]?.json()).toEqual({
      policyVersionId,
      initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
    }),
  );
});
it('CHG-054: without a CNIC on the customer account, check-in needs the typed 13 digits', async () => {
  const bodies: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.method === 'GET')
        return Response.json({
          branchId,
          bookingId,
          terms: { ...terms, fees: [] },
          cnicOnFile: false,
        });
      bodies.push(await request.json());
      return Response.json(result, { status: 201 });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BookingCheckIn actorId={randomUUID()} branchId={branchId} bookingId={bookingId} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Check in resident' }));
  const confirm = await screen.findByRole<HTMLButtonElement>('button', {
    name: 'Confirm check-in',
  });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Resident CNIC'), { target: { value: '35202-1234567' } });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Resident CNIC'), { target: { value: '3520212345671' } });
  expect(confirm.disabled).toBe(false);
  fireEvent.click(confirm);
  expect(await screen.findByText(/Resident checked in/)).toBeDefined();
  expect(bodies[0]).toMatchObject({ policyVersionId, cnic: '3520212345671' });
});
