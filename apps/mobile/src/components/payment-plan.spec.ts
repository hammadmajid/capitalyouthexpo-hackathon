import { describe, expect, it } from 'vitest';
import { recordExternalPaymentInputSchema } from '@hsm/contracts';
import { paymentCommand, paymentProblems, planPayment, type OpenBill } from './payment-plan';
const NOV = '10000000-0000-4000-8000-000000000011';
const DEC = '10000000-0000-4000-8000-000000000012';
const nov: OpenBill = {
  invoiceId: NOV,
  dueDate: '2026-11-01',
  outstandingPaisa: 1080000,
  overdue: true,
};
const dec: OpenBill = {
  invoiceId: DEC,
  dueDate: '2026-12-01',
  outstandingPaisa: 1800000,
  overdue: false,
};
const entry = {
  amount: '10800',
  deposit: '',
  method: 'cash',
  paidOn: '2026-11-14',
  note: 'Payment recorded',
  transactionReference: '',
};
describe('planPayment', () => {
  it('PAY-008: the exact amount owed pays the bill with nothing remaining', () => {
    expect(planPayment(1080000, 0, [nov])).toEqual({
      allocations: [{ invoiceId: NOV, amountPaisa: 1080000 }],
      advancePaisa: 0,
      remainingPaisa: 0,
    });
  });
  it('FIN-001: less than owed is a partial payment with the rest still due', () => {
    expect(planPayment(500000, 0, [nov])).toEqual({
      allocations: [{ invoiceId: NOV, amountPaisa: 500000 }],
      advancePaisa: 0,
      remainingPaisa: 580000,
    });
  });
  it('FIN-001: bills are paid oldest first whatever order they are chosen in', () => {
    const plan = planPayment(1500000, 0, [dec, nov]);
    expect(plan.allocations).toEqual([
      { invoiceId: NOV, amountPaisa: 1080000 },
      { invoiceId: DEC, amountPaisa: 420000 },
    ]);
    expect(plan.remainingPaisa).toBe(1380000);
  });
  it('PAY-008: more than owed is kept as advance credit after the deposit', () => {
    expect(planPayment(3000000, 1000000, [nov])).toEqual({
      allocations: [{ invoiceId: NOV, amountPaisa: 1080000 }],
      advancePaisa: 920000,
      remainingPaisa: 0,
    });
  });
});
describe('paymentCommand', () => {
  it('PAY-008 / SERV-002: one staff-recorded total splits security, rent and transport without advance', () => {
    const rent = { ...nov, outstandingPaisa: 1500000 };
    const transport = { ...dec, outstandingPaisa: 300000 };
    const built = paymentCommand(
      { ...entry, amount: '28000', deposit: '10000' },
      [rent, transport],
      undefined,
    );
    expect(built?.command).toMatchObject({
      amountPaisa: 2800000,
      depositPaisa: 1000000,
      advanceCreditPaisa: 0,
      allocations: [
        { invoiceId: NOV, amountPaisa: 1500000 },
        { invoiceId: DEC, amountPaisa: 300000 },
      ],
    });
    expect(built?.plan.remainingPaisa).toBe(0);
    expect(recordExternalPaymentInputSchema.safeParse(built?.command).success).toBe(true);
  });
  it('PAY-008: a partial payment builds a valid, fully accounted command', () => {
    const built = paymentCommand({ ...entry, amount: '5000' }, [nov], undefined);
    expect(built?.plan.remainingPaisa).toBe(580000);
    expect(recordExternalPaymentInputSchema.safeParse(built?.command).success).toBe(true);
  });
  it('PAY-008: an overpayment with a deposit stays valid', () => {
    const built = paymentCommand(
      { ...entry, amount: '30000', deposit: '10000' },
      [nov],
      '10000000-0000-4000-8000-000000000013',
    );
    expect(built?.command).toMatchObject({ depositPaisa: 1000000, advanceCreditPaisa: 920000 });
    expect(recordExternalPaymentInputSchema.safeParse(built?.command).success).toBe(true);
  });
  it('PAY-008: an empty note saves the default note', () => {
    expect(paymentCommand({ ...entry, note: ' ' }, [nov], undefined)?.command.note).toBe(
      'Payment recorded',
    );
  });
});
describe('paymentProblems', () => {
  it('PAY-008: a complete entry has no problems', () => {
    expect(paymentProblems(entry, false)).toEqual([]);
  });
  it('PAY-008: every missing or wrong field is named in plain words', () => {
    expect(
      paymentProblems(
        { ...entry, amount: '', method: '', paidOn: '14/11/2026', deposit: 'abc' },
        true,
      ),
    ).toEqual([
      'Enter the amount received',
      'Choose how it was paid',
      'Date must look like 2026-11-14',
      'Deposit must be an amount like 5000',
      'Wait for the proof to finish uploading',
    ]);
  });
  it('PAY-008: a deposit larger than the amount is explained', () => {
    expect(paymentProblems({ ...entry, deposit: '20000' }, false)).toEqual([
      'Deposit is more than the amount received',
    ]);
  });
});
