import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { readInventoryAccess, readStaffStayReceipt, uploadPrivateFile } from '@hsm/api-client';
import userEvent from '@testing-library/user-event';
import {
  paymentMocks,
  paymentFixture,
  paymentRequest,
  paymentIds as ids,
  paymentReceipt,
} from './staff-payment.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readInventoryAccess: vi.fn(),
  readStaffStay: vi.fn(),
  readStaffStays: vi.fn(),
  readStaffStayInvoices: vi.fn(),
  readStaffStayInvoice: vi.fn(),
  readStaffStayReceipt: vi.fn(),
  uploadPrivateFile: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: vi.fn() }));
const fixtures: ReturnType<typeof paymentFixture>[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  paymentMocks();
});
afterEach(() => {
  cleanup();
  for (const f of fixtures.splice(0)) f.cache.clear();
});
function fixture(directory = false) {
  const f = paymentFixture(directory);
  fixtures.push(f);
  return f;
}
async function draft(review = true) {
  fireEvent.change(await screen.findByLabelText('Total received (PKR)'), {
    target: { value: '10.01' },
  });
  fireEvent.change(screen.getByLabelText('Payment method'), { target: { value: 'cash' } });
  fireEvent.change(screen.getByLabelText('Date received'), { target: { value: '2028-03-01' } });
  fireEvent.change(screen.getByLabelText('Recording note'), { target: { value: 'Paid directly' } });
  fireEvent.change(screen.getByLabelText('Deposit received (PKR)'), { target: { value: '0' } });
  fireEvent.click(await screen.findByText('Allocate to INV-1'));
  fireEvent.change(screen.getByLabelText('Allocation for INV-1 (PKR)'), {
    target: { value: '10.01' },
  });
  if (!review) return;
  fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
  await screen.findByRole('heading', { name: 'Confirm payment for Selected resident' });
}
async function confirm() {
  await draft();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm recorded payment' }));
}
it('PAY-008 / FIN-001: explicit review and confirmation post exact money through CSRF and read the matching immutable receipt', async () => {
  const f = fixture();
  await draft();
  expect(f.fetch).not.toHaveBeenCalled();
  expect(
    (screen.getByRole('button', { name: 'Confirm recorded payment' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByText('INV-1: PKR 10.01')).toBeDefined();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm recorded payment' }));
  await screen.findByRole('heading', { name: 'Receipt R-1' });
  expect(f.fetch).toHaveBeenCalledTimes(1);
  expect(paymentRequest(f).headers.get('x-csrf-token')).toBe('fixture-csrf');
  expect(paymentRequest(f).credentials).toBe('include');
  expect(await paymentRequest(f).clone().json()).toEqual({
    amountPaisa: 1001,
    method: 'cash',
    paidOn: '2028-03-01',
    note: 'Paid directly',
    allocations: [{ invoiceId: ids.invoice, amountPaisa: 1001 }],
    depositPaisa: 0,
    advanceCreditPaisa: 0,
  });
  expect(readStaffStayReceipt).toHaveBeenCalledWith(
    expect.anything(),
    ids.branch,
    ids.stay,
    ids.receipt,
  );
  expect(screen.getByText('Resident: Original resident')).toBeDefined();
  expect(screen.queryByText(/^Paid$/)).toBeNull();
  expect(screen.queryByText(ids.invoice)).toBeNull();
});
it('ACC-004: network uncertainty hides editing and close, and retries only the retained original command/key', async () => {
  const f = fixture();
  f.fetch.mockRejectedValueOnce(Error('Private network failure'));
  await confirm();
  await screen.findByText(
    'The outcome is unconfirmed. Keep this original payment for a safe retry.',
  );
  expect(screen.queryByLabelText('Total received (PKR)')).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Close payment' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.queryByText('Private network failure')).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'Retry original payment' }));
  await screen.findByRole('heading', { name: 'Receipt R-1' });
  expect(f.fetch).toHaveBeenCalledTimes(2);
  expect(paymentRequest(f).headers.get('idempotency-key')).toBe(
    paymentRequest(f, true).headers.get('idempotency-key'),
  );
  expect(await paymentRequest(f).clone().json()).toEqual(
    await paymentRequest(f, true).clone().json(),
  );
});
it.each(['finance_view', 'payment_record'] as const)(
  'SEC-003: missing current %s never exposes the form or posts money',
  async (missing) => {
    vi.mocked(readInventoryAccess).mockResolvedValue({
      branchId: ids.branch,
      permissions: (['stay_manage', 'finance_view', 'payment_record'] as const).filter(
        (grant) => grant !== missing,
      ),
      canConfigureManagers: false,
    });
    const f = fixture();
    await screen.findByText('Refresh current payment access before viewing or recording money.');
    expect(screen.queryByLabelText('Total received (PKR)')).toBeNull();
    expect(f.fetch).not.toHaveBeenCalled();
  },
);
it.each(['payment', 'number', 'amount'] as const)(
  'SEC-003 / FIN-001: mismatched receipt %s is rejected, not displayed as success',
  async (kind) => {
    const corrupt = {
      ...paymentReceipt,
      snapshot: {
        ...paymentReceipt.snapshot,
        allocations: paymentReceipt.snapshot.allocations.map((row) => ({ ...row })),
        distribution: { ...paymentReceipt.snapshot.distribution },
      },
    };
    if (kind === 'payment') corrupt.snapshot.paymentId = ids.invoice;
    if (kind === 'number') corrupt.receiptNumber = 'R-other';
    if (kind === 'amount') {
      corrupt.snapshot.amountPaisa = 1002;
      corrupt.snapshot.allocations = [
        { invoiceId: ids.invoice, invoiceNumber: 'INV-1', amountPaisa: 1002 },
      ];
      corrupt.snapshot.distribution.allocatedPaisa = 1002;
    }
    vi.mocked(readStaffStayReceipt).mockResolvedValue(corrupt);
    fixture();
    await confirm();
    await screen.findByRole('button', { name: 'Retry receipt' });
    expect(screen.queryByRole('heading', { name: 'Receipt R-1' })).toBeNull();
    expect(screen.queryByText('Resident: Original resident')).toBeNull();
  },
);
it('SEC-003: failed live access revalidation hides a cached receipt without resubmitting the known payment', async () => {
  const f = fixture();
  await confirm();
  await screen.findByRole('heading', { name: 'Receipt R-1' });
  vi.mocked(readInventoryAccess).mockRejectedValue(Error('Private grant denial'));
  await act(async () => {
    await f.cache.invalidateQueries({
      queryKey: ['payment-authority', ids.actor, ids.branch, ids.stay],
    });
  });
  await screen.findByRole('alert');
  expect(screen.queryByText('Resident: Original resident')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Receipt R-1' })).toBeNull();
  expect(f.fetch).toHaveBeenCalledTimes(1);
});
it('PAY-008 / SEC-003: actual named staff Stay mounts payment recording only with live operational and financial grants', async () => {
  fixture(true);
  fireEvent.click(await screen.findByRole('button', { name: 'Residents and stays' }));
  fireEvent.click(await screen.findByRole('button', { name: 'View stay for Selected resident' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Record external payment' }));
  await screen.findByLabelText('Total received (PKR)');
  expect(readInventoryAccess).toHaveBeenCalledTimes(2);
});

it.each([true, false])(
  'PAY-008 / SEC-003: clean direct proof is included only while explicitly selected=%s',
  async (attach) => {
    const f = fixture(),
      proofId = '10000000-0000-4000-8000-000000000008';
    let complete: (id: string) => void = () => {
      throw Error('Upload fixture missing');
    };
    const pending = new Promise<string>((resolve) => {
      complete = resolve;
    });
    vi.mocked(uploadPrivateFile).mockReturnValueOnce(pending);
    await draft(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Attach a private proof (optional)' }));
    const file = new File(['proof'], 'payment.pdf', { type: 'application/pdf' });
    await userEvent.setup().upload(screen.getByLabelText('Direct payment proof'), file);
    expect(
      (screen.getByRole('button', { name: 'Review payment' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(f.fetch).not.toHaveBeenCalled();
    await act(async () => {
      complete(proofId);
      await pending;
    });
    await screen.findByText('File checked and ready.');
    if (!attach)
      fireEvent.click(screen.getByRole('checkbox', { name: 'Attach a private proof (optional)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    if (attach) await screen.findByText('Private checked proof attached.');
    else expect(screen.queryByText('Private checked proof attached.')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm recorded payment' }));
    await screen.findByRole('heading', { name: 'Receipt R-1' });
    expect(uploadPrivateFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ purpose: 'payment_proof', mimeType: 'application/pdf' }),
      file,
    );
    const body: unknown = await paymentRequest(f).clone().json();
    if (attach) expect(body).toMatchObject({ proofFileId: proofId });
    else expect(body).not.toHaveProperty('proofFileId');
    expect(screen.queryByText(proofId)).toBeNull();
  },
);
