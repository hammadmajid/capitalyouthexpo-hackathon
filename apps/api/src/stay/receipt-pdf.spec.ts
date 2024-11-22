import { expect, it } from 'vitest';
import { receiptLines, renderReceiptPdf } from './receipt-pdf.js';
const id = '10000000-0000-4000-8000-000000000001';
const detail = {
  receiptId: id,
  receiptNumber: 'RCP-0001',
  issuedAt: '2026-10-25T10:00:00.000Z',
  reversed: false,
  snapshot: {
    version: 1 as const,
    currency: 'PKR' as const,
    paymentId: id,
    branchId: id,
    stayId: id,
    residentName: 'Muhammad (Ali) Very Long Resident Name '.repeat(4).trim(),
    hostelName: 'Twin Cities Hostel',
    branchName: 'Branch A',
    amountPaisa: 1850050,
    method: 'bank_transfer' as const,
    transactionReference: 'TRX\\42',
    paidOn: '2026-10-24',
    approvedAt: '2026-10-25T09:00:00.000Z',
    allocations: [{ invoiceId: id, invoiceNumber: 'INV-1', amountPaisa: 1800000 }],
    distribution: { allocatedPaisa: 1800000, depositPaisa: 0, advanceCreditPaisa: 50050 },
  },
};
it('PAY-009: renders a valid single-page PDF with a correct cross-reference table', () => {
  const pdf = renderReceiptPdf(detail).toString('latin1');
  expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
  expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  const startxref = Number(/startxref\n(\d+)\n/.exec(pdf)?.[1]);
  expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
  const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
  expect(offsets).toHaveLength(6);
  offsets.forEach((offset, index) => {
    expect(pdf.slice(offset, offset + String(index + 1).length + 6)).toBe(`${index + 1} 0 obj`);
  });
  expect(pdf).toContain('(Amount received: PKR 18,500.50) Tj');
  expect(pdf).toContain('(Advance credit: PKR 500.50) Tj');
  // PDF string delimiters and backslashes are escaped, never breaking the content stream.
  expect(pdf).toContain('\\(Ali\\)');
  expect(pdf).toContain('TRX\\\\42');
});
it('PAY-009: long names wrap, non-Latin text is replaced and reversal is stated', () => {
  const lines = receiptLines({
    ...detail,
    reversed: true,
    snapshot: { ...detail.snapshot, residentName: 'محمد علی', transactionReference: null },
  });
  expect(lines.every((line) => line.length <= 86)).toBe(true);
  expect(lines).toContain('THIS PAYMENT WAS REVERSED BY THE HOSTEL OWNER.');
  expect(
    renderReceiptPdf({ ...detail, snapshot: { ...detail.snapshot, residentName: 'علی' } }).toString(
      'latin1',
    ),
  ).toContain('Resident: ???');
  const wrapped = receiptLines(detail).filter(
    (line) => line.includes('Resident') || line.includes('Name'),
  );
  expect(wrapped.length).toBeGreaterThan(1);
});
