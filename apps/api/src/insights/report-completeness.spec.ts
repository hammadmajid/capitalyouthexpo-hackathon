import { expect, it, vi } from 'vitest';
import { readResidentFundBalance, readResidentInvoiceBalance } from '@hsm/db';
import {
  reportCandidatesFixture,
  type Candidate,
} from '../../test/unit/report-candidates.fixture.js';
import { depositsReport, outstandingReport } from './reports-financial.js';

const fixtures = vi.hoisted(() => new Map<string, boolean>());
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  readResidentInvoiceBalance: vi.fn(async (_tx: unknown, value: { invoiceId: string }) => ({
    invoiceId: value.invoiceId,
    state: 'issued',
    outstandingPaisa: fixtures.get(value.invoiceId) ? 1 : 0,
  })),
  readResidentFundBalance: vi.fn(async (_tx: unknown, value: { stayId: string }) => ({
    deposit: {
      receivedPaisa: fixtures.get(value.stayId) ? 1 : 0,
      heldPaisa: 1,
      appliedToRentPaisa: 0,
      deductedPaisa: 0,
      refundedPaisa: 0,
    },
  })),
  readResidentInvoiceBalances: vi.fn(
    async (tx: unknown, value: { invoices: { invoiceId: string }[] }) =>
      Promise.all(value.invoices.map((row) => readResidentInvoiceBalance(tx as never, row))),
  ),
  readResidentFundBalances: vi.fn(async (tx: unknown, value: { stayIds: string[] }) =>
    Promise.all(
      value.stayIds.map(async (stayId) => ({
        stayId,
        ...(await readResidentFundBalance(tx as never, { stayId })),
      })),
    ),
  ),
}));
const branchId = '10000000-0000-4000-8000-000000000001';
const window = {
  from: null,
  to: '2026-06-26',
  today: '2026-06-26',
  now: new Date('2026-06-26T07:00:00Z'),
};
function candidates(prefix: number, matches: number) {
  fixtures.clear();
  return Array.from({ length: prefix + matches }, (_, index): Candidate => {
    const id = '20000000-0000-4000-8000-' + String(index).padStart(12, '0');
    const matching = index >= prefix;
    fixtures.set(id, matching);
    return {
      id,
      branchId,
      stayId: id,
      due: '2026-06-25',
      resident: 'Resident ' + index,
      number: 'INV-' + index,
      state: 'active',
      matching,
    };
  });
}
for (const family of ['outstanding', 'deposits'] as const) {
  it.each([
    [5001, 1],
    [0, 5000],
    [0, 5001],
    [0, 6000],
    [0, 0],
    [5001, 0],
    [99, 2],
  ])(
    'RPT-001 / AUD-006: ' +
      family +
      ' scans %i nonmatches and retains all %i eligible rows up to the sentinel',
    async (prefix, matches) => {
      const rows = candidates(prefix, matches);
      const f = reportCandidatesFixture(rows, branchId);
      const result =
        family === 'outstanding'
          ? await outstandingReport(f.transaction, [branchId], window)
          : await depositsReport(f.transaction, [branchId]);
      expect(result.rows).toHaveLength(Math.min(matches, 5001));
      if (matches) expect(result.rows[0]?.[1]).toBe('Resident ' + prefix);
      expect(f.limits.every((value) => value <= 100)).toBe(true);
      expect(f.limits.length).toBe(matches > 5000 ? 51 : Math.floor((prefix + matches) / 100) + 1);
    },
  );
}
