import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFinalStatement, recordStayFundMovement } from '@hsm/api-client';
import { PostCheckoutRefund } from './stay-refund';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readFinalStatement: vi.fn(),
  recordStayFundMovement: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
afterEach(cleanup);
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const zero = {
  receivedPaisa: 0,
  appliedToRentPaisa: 0,
  deductedPaisa: 0,
  refundedPaisa: 0,
  heldPaisa: 0,
};
const settlement = (sources: unknown[]) => ({
  stayId: id,
  branchId: id,
  stayState: 'completed',
  invoices: [],
  invoicesTruncated: false,
  outstandingPaisa: 0,
  deposit: zero,
  advance: zero,
  netPayablePaisa: 0,
  netRefundablePaisa: 500000,
  fundSources: sources,
  asOf: '2026-10-27',
});
function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PostCheckoutRefund actorId="a" branchId={id} stayId={id} />
    </QueryClientProvider>,
  );
}
it('P9-FIX-04: staff record a refund after checkout against an exact receipt', async () => {
  const sources = [
    { paymentId: id, receiptNumber: 'RCP-1', depositPaisa: 500000, advanceCreditPaisa: 0 },
  ];
  vi.mocked(readFinalStatement).mockResolvedValue({
    statementId: id,
    createdAt: '2026-10-27T10:00:00.000Z',
    statement: settlement(sources),
    afterCheckout: { movements: [], current: settlement(sources) },
  } as never);
  vi.mocked(recordStayFundMovement).mockResolvedValue({} as never);
  show();
  fireEvent.change(await screen.findByLabelText('Refund source payment'), {
    target: { value: id },
  });
  fireEvent.change(screen.getByLabelText('Refund amount (PKR)'), { target: { value: '2000' } });
  fireEvent.change(screen.getByLabelText('Refund reference (optional)'), {
    target: { value: 'BANK-1' },
  });
  fireEvent.change(screen.getByLabelText('Refund reason'), {
    target: { value: 'Deposit returned' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record refund' }));
  await waitFor(() => expect(recordStayFundMovement).toHaveBeenCalled());
  expect(vi.mocked(recordStayFundMovement).mock.calls[0]?.[3]).toEqual({
    paymentId: id,
    movement: {
      kind: 'deposit_refund',
      amountPaisa: 200000,
      reason: 'Deposit returned',
      externalReference: 'BANK-1',
    },
  });
  expect(await screen.findByText('Refund recorded.')).toBeDefined();
});
it('shows nothing when no receipt holds funds', async () => {
  vi.mocked(readFinalStatement).mockResolvedValue({
    statementId: id,
    createdAt: '2026-10-27T10:00:00.000Z',
    statement: settlement([]),
    afterCheckout: { movements: [], current: settlement([]) },
  } as never);
  show();
  await waitFor(() => expect(readFinalStatement).toHaveBeenCalled());
  expect(screen.queryByLabelText('Refund source payment')).toBeNull();
});
