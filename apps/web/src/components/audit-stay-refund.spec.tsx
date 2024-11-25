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
it('PAY-008 / OUT-004 / AUD-003: lost refund response can retry original details after remount even when its source is spent', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const paymentId = '10000000-0000-4000-8000-000000000001';
  vi.mocked(readFinalStatement).mockResolvedValue({
    afterCheckout: {
      current: {
        fundSources: [
          { paymentId, receiptNumber: 'RCP-1', depositPaisa: 10000, advanceCreditPaisa: 0 },
        ],
      },
    },
  } as never);
  vi.mocked(recordStayFundMovement)
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValue({ movementId: 'once' } as never);
  const tree = (
    <QueryClientProvider client={client}>
      <PostCheckoutRefund actorId="audit-refund-actor" branchId="branch" stayId="stay" />
    </QueryClientProvider>
  );
  const first = render(tree);
  await screen.findByRole('option', { name: /RCP-1/ });
  fireEvent.change(screen.getByLabelText('Refund source payment'), {
    target: { value: paymentId },
  });
  fireEvent.change(screen.getByLabelText('Refund amount (PKR)'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Refund reason'), {
    target: { value: 'Already refunded externally' },
  });
  // The authoritative refresh sees the committed refund before the lost response is recovered.
  vi.mocked(readFinalStatement).mockResolvedValue({
    afterCheckout: { current: { fundSources: [] } },
  } as never);
  fireEvent.click(screen.getByRole('button', { name: 'Record refund' }));
  await screen.findByRole('alert');
  const original = vi.mocked(recordStayFundMovement).mock.calls[0];
  expect(original?.[3]).toMatchObject({ movement: { amountPaisa: 10000 } });
  first.unmount();
  render(tree);
  fireEvent.click(screen.getByRole('button', { name: 'Retry previous request' }));
  await waitFor(() => expect(recordStayFundMovement).toHaveBeenCalledTimes(2));
  expect(vi.mocked(recordStayFundMovement).mock.calls[1]?.slice(1)).toEqual(original?.slice(1));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Retry previous request' })).toBeNull(),
  );
  client.clear();
});
