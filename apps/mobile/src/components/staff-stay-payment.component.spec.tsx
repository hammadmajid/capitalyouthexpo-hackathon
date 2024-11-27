jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
  useFocusEffect: jest.fn(),
}));
/// <reference types="jest" />
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  readInventoryAccess,
  readStaffStay,
  readStaffStays,
  readStaffStayInvoices,
  readStaffStayInvoice,
  readStaffStayReceipt,
  branchPaymentProofQueue,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { uploadSelectedDocument } from '../lib/private-file';
import {
  paymentMocks,
  paymentFixture,
  paymentRequest,
  paymentIds as ids,
  paymentReceipt,
} from './staff-payment.fixture';
import { pickDate } from '../test-utils/pick-date';
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  readInventoryAccess: jest.fn(),
  readStaffStay: jest.fn(),
  readStaffStays: jest.fn(),
  readStaffStayInvoices: jest.fn(),
  readStaffStayInvoice: jest.fn(),
  readStaffStayReceipt: jest.fn(),
  branchPaymentProofQueue: jest.fn(async () => ({ data: [], nextCursor: null })),
}));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn() }));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '10000000-0000-4000-8000-000000000007'),
}));

jest.mock('../lib/private-file', () => {
  const { UploadFailure } = jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client');
  return {
    uploadSelectedDocument: jest.fn(),
    PendingDocumentUpload: class extends UploadFailure {
      upload: unknown;
      constructor(id: string, upload: unknown) {
        super('PENDING', id);
        this.upload = upload;
      }
    },
  };
});
const fixtures: Awaited<ReturnType<typeof paymentFixture>>[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  for (const read of [
    readInventoryAccess,
    readStaffStay,
    readStaffStays,
    readStaffStayInvoices,
    readStaffStayInvoice,
    readStaffStayReceipt,
  ])
    jest.mocked(read).mockReset();
  jest.mocked(actorClient).mockReset();
  jest.mocked(uploadSelectedDocument).mockReset();
  paymentMocks();
  jest.mocked(branchPaymentProofQueue).mockResolvedValue({ data: [], nextCursor: null });
});
afterEach(() => {
  for (const f of fixtures.splice(0)) f.cache.clear();
});
async function fixture(directory = false) {
  const f = await paymentFixture(directory);
  fixtures.push(f);
  return f;
}
async function draft(review = true) {
  // FIN-001: the unpaid bill is chosen and the amount follows what it still owes.
  // Bills load asynchronously; allow for a busy test machine.
  await screen.findByRole('checkbox', { name: /^Pay bill due / }, { timeout: 5000 });
  expect(screen.getByLabelText('Total received (PKR)').props.value).toBe('10.01');
  await fireEvent.press(screen.getByRole('button', { name: 'Pay by Cash' }));
  await pickDate('Date received', '2028-03-01');
  await fireEvent.press(screen.getByRole('button', { name: 'Deposit, note and reference' }));
  // PAY-008: the note arrives filled in and stays editable.
  expect(screen.getByLabelText('Recording note').props.value).toBe('Payment recorded');
  await fireEvent.changeText(screen.getByLabelText('Recording note'), 'Paid directly');
  if (!review) return;
  await fireEvent.press(screen.getByRole('button', { name: 'Review payment' }));
  await screen.findByText(/from Selected resident$/);
}
async function confirm() {
  await draft();
  await fireEvent(
    screen.getByRole('switch', { name: 'Confirm directly received payment' }),
    'valueChange',
    true,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm recorded payment' }));
}
test('PAY-008 / FIN-001: native explicit review posts exact bearer command and reads the correlated immutable receipt', async () => {
  const f = await fixture();
  await draft();
  expect(f.fetch).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Confirm recorded payment' }).props.accessibilityState
      .disabled,
  ).toBe(true);
  expect(screen.getByText(/^Bill due .*: PKR 10\.01$/)).toBeTruthy();
  await fireEvent(
    screen.getByRole('switch', { name: 'Confirm directly received payment' }),
    'valueChange',
    true,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm recorded payment' }));
  await screen.findByText('Receipt R-1');
  expect(f.fetch).toHaveBeenCalledTimes(1);
  expect(paymentRequest(f).headers.get('authorization')).toBe('Bearer fixture-access');
  expect(paymentRequest(f).credentials).toBe('omit');
  expect(await paymentRequest(f).clone().json()).toEqual({
    amountPaisa: 1001,
    method: 'cash',
    paidOn: '2028-03-01',
    note: 'Paid directly',
    allocations: [{ invoiceId: ids.invoice, amountPaisa: 1001 }],
    depositPaisa: 0,
    advanceCreditPaisa: 0,
  });
  expect(screen.getByText(/^Original resident · /)).toBeTruthy();
  expect(screen.queryByText(/^Paid$/)).toBeNull();
  expect(screen.queryByText(ids.invoice)).toBeNull();
});
test('ACC-004: native uncertain outcome disables editing/close and preserves the original reviewed request', async () => {
  const f = await fixture();
  f.fetch.mockRejectedValueOnce(Error('Private network failure'));
  await confirm();
  await screen.findByText(
    'The outcome is unconfirmed. Keep this original payment for a safe retry.',
  );
  expect(screen.queryByLabelText('Total received (PKR)')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Close payment' }).props.accessibilityState.disabled,
  ).toBe(true);
  expect(screen.queryByText('Private network failure')).toBeNull();
  await fireEvent.press(await screen.findByRole('button', { name: 'Retry original payment' }));
  await screen.findByText('Receipt R-1');
  expect(f.fetch).toHaveBeenCalledTimes(2);
  expect(paymentRequest(f).headers.get('idempotency-key')).toBe(
    paymentRequest(f, true).headers.get('idempotency-key'),
  );
  expect(await paymentRequest(f).clone().json()).toEqual(
    await paymentRequest(f, true).clone().json(),
  );
});
test.each(['finance_view', 'payment_record'] as const)(
  'SEC-003: native missing live %s hides recording and never posts',
  async (missing) => {
    jest.mocked(readInventoryAccess).mockResolvedValue({
      branchId: ids.branch,
      permissions: (['stay_manage', 'finance_view', 'payment_record'] as const).filter(
        (grant) => grant !== missing,
      ),
      canConfigureManagers: false,
    });
    const f = await fixture();
    await screen.findByText('Pull down to load payment access before viewing or recording money.');
    expect(screen.queryByLabelText('Total received (PKR)')).toBeNull();
    expect(f.fetch).not.toHaveBeenCalled();
  },
);
test.each(['payment', 'number', 'amount'] as const)(
  'SEC-003 / FIN-001: native receipt must match acknowledged %s',
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
    jest.mocked(readStaffStayReceipt).mockResolvedValue(corrupt);
    await fixture();
    await confirm();
    await screen.findAllByRole('alert');
    expect(screen.queryByText('Receipt R-1')).toBeNull();
    expect(screen.queryByText(/^Original resident · /)).toBeNull();
  },
);
test('SEC-003: native failed current financial access hides cached receipt and never repeats the recorded payment', async () => {
  const f = await fixture();
  await confirm();
  await screen.findByText('Receipt R-1');
  jest.mocked(readInventoryAccess).mockRejectedValue(Error('Private grant denial'));
  await act(async () => {
    await f.cache.invalidateQueries({
      queryKey: ['payment-authority', ids.actor, ids.branch, ids.stay],
    });
  });
  await screen.findByRole('alert');
  expect(screen.queryByText(/^Original resident · /)).toBeNull();
  expect(screen.queryByText('Receipt R-1')).toBeNull();
  expect(f.fetch).toHaveBeenCalledTimes(1);
});
test('PAY-008 / SEC-003: actual native staff Stay entry mounts the protected recording workflow', async () => {
  await fixture(true);
  await fireEvent.press(await screen.findByRole('button', { name: 'Residents and stays' }));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'View stay for Selected resident' }),
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Collect Rent' }));
  await screen.findByLabelText('Total received (PKR)');
  expect(readInventoryAccess).toHaveBeenCalledTimes(2);
});

test.each([true, false])(
  'PAY-008 / SEC-003: native clean actor-bound proof is included only while selected=%s',
  async (attach) => {
    const f = await fixture(),
      proofId = '10000000-0000-4000-8000-000000000008';
    let complete: (id: string) => void = () => {
      throw Error('Upload fixture missing');
    };
    const pending = new Promise<string>((resolve) => {
      complete = resolve;
    });
    jest.mocked(uploadSelectedDocument).mockImplementationOnce((_client, _purpose, onSelected) => {
      onSelected('file:///cache/selection.jpg');
      return pending;
    });
    await draft(false);
    await fireEvent(
      screen.getByRole('switch', { name: 'Attach a private proof (optional)' }),
      'valueChange',
      true,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Choose proof' }));
    // PAY-008: reviewing too early says exactly what is still missing.
    await fireEvent.press(screen.getByRole('button', { name: 'Review payment' }));
    await screen.findByText('• Wait for the proof to finish uploading');
    expect(f.fetch).not.toHaveBeenCalled();
    await act(async () => {
      complete(proofId);
      await pending;
    });
    await screen.findByText('Attached');
    if (!attach)
      await fireEvent(
        screen.getByRole('switch', { name: 'Attach a private proof (optional)' }),
        'valueChange',
        false,
      );
    await fireEvent.press(screen.getByRole('button', { name: 'Review payment' }));
    if (attach) await screen.findByText('Proof attached');
    else expect(screen.queryByText('Proof attached')).toBeNull();
    await fireEvent(
      screen.getByRole('switch', { name: 'Confirm directly received payment' }),
      'valueChange',
      true,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm recorded payment' }));
    await screen.findByText('Receipt R-1');
    expect(uploadSelectedDocument).toHaveBeenCalledWith(
      expect.anything(),
      'payment_proof',
      expect.any(Function),
    );
    const body: unknown = await paymentRequest(f).clone().json();
    if (attach) expect(body).toMatchObject({ proofFileId: proofId });
    else expect(body).not.toHaveProperty('proofFileId');
    expect(screen.queryByText(proofId)).toBeNull();
  },
);

test('FIN-001 / PAY-008: paying less shows a partial payment and posts it against the bill', async () => {
  const f = await fixture();
  await draft(false);
  await fireEvent.changeText(screen.getByLabelText('Total received (PKR)'), '4');
  await screen.findByText('Partial payment · PKR 6.01 still due');
  await fireEvent.press(screen.getByRole('button', { name: 'Review payment' }));
  await screen.findByText(/from Selected resident$/);
  await fireEvent(
    screen.getByRole('switch', { name: 'Confirm directly received payment' }),
    'valueChange',
    true,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm recorded payment' }));
  await waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(1));
  expect(await paymentRequest(f).clone().json()).toMatchObject({
    amountPaisa: 400,
    allocations: [{ invoiceId: ids.invoice, amountPaisa: 400 }],
    advanceCreditPaisa: 0,
  });
});
test('PAY-008: missing details are listed in plain words and nothing is posted', async () => {
  const f = await fixture();
  // Bills load asynchronously; allow for a busy test machine.
  await screen.findByRole('checkbox', { name: /^Pay bill due / }, { timeout: 5000 });
  await fireEvent.changeText(screen.getByLabelText('Total received (PKR)'), '');
  await fireEvent.press(screen.getByRole('button', { name: 'Review payment' }));
  await screen.findByText('• Enter the amount received');
  expect(screen.getByText('• Choose how it was paid')).toBeTruthy();
  // The date picker cannot produce a malformed date, so only amount and method are missing.
  expect(f.fetch).not.toHaveBeenCalled();
});

test('PAY-008 / CHG-055: staff cannot review a payment above selected obligations', async () => {
  const f = await fixture();
  await draft(false);
  await fireEvent.changeText(screen.getByLabelText('Total received (PKR)'), '10.02');
  await fireEvent.press(screen.getByRole('button', { name: 'Review payment' }));
  expect(
    (await screen.findAllByText('Amount exceeds the selected bills and security deposit total'))
      .length,
  ).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: 'Confirm recorded payment' })).toBeNull();
  expect(f.fetch).not.toHaveBeenCalled();
});

it('PAY-008: a classified combined bill defaults to rent plus transport plus only outstanding security', async () => {
  jest.mocked(readStaffStayInvoice).mockResolvedValue({
    invoiceId: ids.invoice,
    invoiceNumber: 'INV-1',
    currency: 'PKR',
    dueDate: '2028-03-01',
    graceDays: 0,
    totalPaisa: 1500000,
    debitAdjustmentsPaisa: 0,
    creditAdjustmentsPaisa: 0,
    allocatedPaisa: 0,
    outstandingPaisa: 1500000,
    state: 'issued',
    securityDuePaisa: 1000000,
    securityPendingPaisa: 0,
    lineItems: [
      { kind: 'rent', description: 'Monthly rent', amountPaisa: 1000000 },
      { kind: 'transport', description: 'Transport', amountPaisa: 500000 },
    ],
  });
  await fixture();
  expect((await screen.findByLabelText('Total received (PKR)')).props.value).toBe('25,000.00');
  expect(screen.getByText('Security deposit: PKR 10,000')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Pay by Cash' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Review payment' }));
  expect(await screen.findByLabelText('Review external payment')).toBeTruthy();
  expect(screen.getByText('Deposit: PKR 10,000')).toBeTruthy();
});
