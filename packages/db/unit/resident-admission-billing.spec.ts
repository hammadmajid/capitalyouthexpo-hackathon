import { beforeEach, expect, it, vi } from 'vitest';
import type { PostingTransaction } from '../src/resident-posting-context.js';
import {
  rentCommand,
  rentTime,
  rentTerms,
  rentStay,
  rentAgreement,
} from './resident-rent.fixture.js';
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  rent: vi.fn(),
  fee: vi.fn(),
  schedule: vi.fn(),
  notice: vi.fn(),
}));
vi.mock('../src/resident-posting-context.js', async (original) => ({
  ...(await original<typeof import('../src/resident-posting-context.js')>()),
  readPostingContext: mocks.context,
}));
vi.mock('../src/resident-rent.js', () => ({ postAgreedRentPeriod: mocks.rent }));
vi.mock('../src/resident-fees.js', () => ({ postAgreedFeePeriod: mocks.fee }));
vi.mock('../src/resident-billing-authorize.js', () => ({
  authorizeResidentBilling: mocks.schedule,
}));
vi.mock('../src/rent-notices.js', () => ({ enqueueResidentRent: mocks.notice }));
import { initializeAdmissionBilling } from '../src/resident-admission-billing.js';
const tx = {} as PostingTransaction;
const scope = {
  branchId: rentCommand.branchId,
  stayId: rentCommand.stayId,
  agreementId: rentCommand.agreementId,
  actorUserId: rentCommand.actorUserId,
  organizationId: rentCommand.branchId,
  actorRole: 'owner',
};
const selection = { item: 'rent', cadence: 'periodic', periodIndex: 4 };
const context = { stay: rentStay(), agreement: rentAgreement(), terms: rentTerms };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue(context);
  mocks.rent.mockResolvedValue({
    status: 'posted',
    chargeId: rentCommand.stayId,
    invoiceId: rentCommand.branchId,
  });
  mocks.fee.mockResolvedValue({
    status: 'posted',
    chargeId: rentCommand.stayId,
    invoiceId: rentCommand.branchId,
  });
  mocks.schedule.mockResolvedValue({ id: rentCommand.agreementId, state: 'active' });
});
it('STAY-001 / RENT-004: initial human posting precedes future scheduling in the same transaction and uses the selected cursor', async () => {
  const result = await initializeAdmissionBilling(tx, { scope, selections: [selection] }, rentTime);
  // RENT-001 / NTF-001: the first issued invoice announces rent due in the same transaction.
  expect(mocks.notice).toHaveBeenCalledWith(
    tx,
    { event: 'rent.due', stayId: scope.stayId, invoiceId: rentCommand.branchId },
    rentTime,
  );
  expect(mocks.rent).toHaveBeenCalledWith(
    tx,
    {
      branchId: scope.branchId,
      stayId: scope.stayId,
      agreementId: scope.agreementId,
      actorUserId: scope.actorUserId,
      periodIndex: 4,
    },
    rentTime,
  );
  expect(mocks.schedule).toHaveBeenCalledWith(
    tx,
    { ...scope, item: 'rent', cadence: 'periodic', periodIndex: 5, dispatch: 'on_due_date' },
    rentTime,
  );
  expect(mocks.rent.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.schedule.mock.invocationCallOrder[0] ?? 0,
  );
  expect(result).toMatchObject([
    { item: 'rent', posting: { status: 'posted' }, schedule: { state: 'active' } },
  ]);
});
it.each(['already_posted', 'no_charge', 'no_period'])(
  'RENT-004: initial %s result preserves exact bounded progress',
  async (status) => {
    mocks.rent.mockResolvedValue({ status, chargeId: null, invoiceId: null });
    await initializeAdmissionBilling(tx, { scope, selections: [selection] }, rentTime);
    expect(mocks.schedule).toHaveBeenCalledWith(
      tx,
      {
        ...scope,
        ...selection,
        periodIndex: status === 'no_period' ? 4 : 5,
        dispatch: 'on_due_date',
      },
      rentTime,
    );
  },
);
it('FIN-004: all disclosed monthly and one-time fees retain explicit independent initial cursors and manual amounts', async () => {
  mocks.context.mockResolvedValue({
    ...context,
    terms: {
      ...rentTerms,
      fees: [
        { code: 'mess', cadence: 'monthly', amountPaisa: 100 },
        { code: 'admission', cadence: 'one_time', amountPaisa: 200 },
      ],
    },
  });
  const fees = [
    { item: 'mess', cadence: 'periodic', periodIndex: 2, manualAmountPaisa: 0 },
    { item: 'admission', cadence: 'one_time', periodIndex: 0 },
  ];
  await initializeAdmissionBilling(tx, { scope, selections: [selection, ...fees] }, rentTime);
  expect(mocks.fee).toHaveBeenNthCalledWith(
    1,
    tx,
    {
      branchId: scope.branchId,
      stayId: scope.stayId,
      agreementId: scope.agreementId,
      actorUserId: scope.actorUserId,
      periodIndex: 2,
      manualAmountPaisa: 0,
      fee: { code: 'mess', cadence: 'monthly' },
    },
    rentTime,
  );
  expect(mocks.fee).toHaveBeenNthCalledWith(
    2,
    tx,
    expect.objectContaining({ periodIndex: 0, fee: { code: 'admission', cadence: 'one_time' } }),
    rentTime,
  );
  expect(mocks.schedule).toHaveBeenCalledTimes(3);
});
it('RENT-003: an explicit initial partial rent amount reaches only the human posting command', async () => {
  await initializeAdmissionBilling(
    tx,
    { scope, selections: [{ ...selection, manualAmountPaisa: 123 }] },
    rentTime,
  );
  expect(mocks.rent).toHaveBeenCalledWith(
    tx,
    expect.objectContaining({ manualAmountPaisa: 123 }),
    rentTime,
  );
  expect(mocks.schedule).toHaveBeenCalledWith(
    tx,
    { ...scope, ...selection, periodIndex: 5, dispatch: 'on_due_date' },
    rentTime,
  );
});
it.each([
  { selections: [] },
  { selections: [selection, selection] },
  { selections: [{ ...selection, item: 'mess' }] },
  { selections: [selection, { ...selection, item: 'utilities' }] },
])(
  'FIN-004: incomplete, duplicate or extraneous initial selection %# has no writes',
  async ({ selections }) => {
    await expect(initializeAdmissionBilling(tx, { scope, selections }, rentTime)).rejects.toThrow();
    expect(mocks.rent).not.toHaveBeenCalled();
    expect(mocks.fee).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  },
);
it('FIN-004: omitted disclosed fee fails before any initial posting', async () => {
  mocks.context.mockResolvedValue({
    ...context,
    terms: { ...rentTerms, fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 100 }] },
  });
  await expect(
    initializeAdmissionBilling(tx, { scope, selections: [selection] }, rentTime),
  ).rejects.toThrow('Select exactly rent and every disclosed fee starting period');
  expect(mocks.rent).not.toHaveBeenCalled();
});
it.each([
  { name: 'context', mock: mocks.context },
  { name: 'rent', mock: mocks.rent },
  { name: 'schedule', mock: mocks.schedule },
])(
  'ACC-004: required $name failure propagates to caller transaction rollback',
  async ({ mock }) => {
    mock.mockRejectedValueOnce(new Error('Mandatory fixture failure'));
    await expect(
      initializeAdmissionBilling(tx, { scope, selections: [selection] }, rentTime),
    ).rejects.toThrow('Mandatory fixture failure');
  },
);
it('ACC-004: a required disclosed fee failure cannot return partial admission success', async () => {
  mocks.context.mockResolvedValue({
    ...context,
    terms: { ...rentTerms, fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 100 }] },
  });
  mocks.fee.mockRejectedValueOnce(new Error('Fee fixture failure'));
  await expect(
    initializeAdmissionBilling(
      tx,
      { scope, selections: [selection, { ...selection, item: 'mess' }] },
      rentTime,
    ),
  ).rejects.toThrow('Fee fixture failure');
});
it.each([
  { periodIndex: Number.MAX_SAFE_INTEGER },
  { periodIndex: -1 },
  { amountPaisa: 1 },
  { item: 'custom' },
  { manualAmountPaisa: 0.1 },
])('SEC-003: invalid initial selection %# is rejected before context', async (patch) => {
  await expect(
    initializeAdmissionBilling(tx, { scope, selections: [{ ...selection, ...patch }] }, rentTime),
  ).rejects.toThrow();
  expect(mocks.context).not.toHaveBeenCalled();
});
