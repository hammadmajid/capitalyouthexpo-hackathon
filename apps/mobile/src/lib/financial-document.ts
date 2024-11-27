import { marketplacePrice } from '@hsm/api-client';
import { residentInvoiceBalanceSchema, residentReceiptDetailSchema } from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';

export type FinancialDocument = {
  title: string;
  number: string;
  status: string;
  rows: [string, string][];
};
export function receiptDocument(input: unknown): FinancialDocument {
  const receipt = residentReceiptDetailSchema.parse(input),
    value = receipt.snapshot;
  return {
    title: 'Payment receipt',
    number: receipt.receiptNumber,
    status: receipt.reversed ? 'REVERSED' : 'APPROVED',
    rows: [
      ['Hostel', value.hostelName],
      ['Branch', value.branchName],
      ['Resident', value.residentName],
      ['Payment date', value.paidOn],
      ['Amount received', marketplacePrice(value.amountPaisa)],
      ['Method', value.method.replaceAll('_', ' ')],
      ...value.allocations.map((row): [string, string] => [
        row.invoiceNumber,
        marketplacePrice(row.amountPaisa),
      ]),
      ['Security deposit', marketplacePrice(value.distribution.depositPaisa)],
      ...(value.distribution.advanceCreditPaisa
        ? [
            ['Historical advance', marketplacePrice(value.distribution.advanceCreditPaisa)] as [
              string,
              string,
            ],
          ]
        : []),
      ...(value.transactionReference
        ? [['Reference', value.transactionReference] as [string, string]]
        : []),
    ],
  };
}
export function invoiceDocument(input: unknown): FinancialDocument {
  const value = residentInvoiceBalanceSchema.parse(input);
  return {
    title: 'Rent / services invoice',
    number: value.invoiceNumber,
    status:
      (value.securityDuePaisa ?? 0) > 0
        ? 'SECURITY DUE · ' + value.state.replaceAll('_', ' ').toUpperCase()
        : value.state.replaceAll('_', ' ').toUpperCase(),
    rows: [
      ['Due date', value.dueDate],
      ...(value.lineItems ?? []).map((line): [string, string] => [
        {
          rent: 'Rent',
          transport: 'Transport',
          mess: 'Mess',
          utilities: 'Utilities',
          admission: 'Admission fee',
          custom: 'Other charge',
          late_fee: 'Late fee',
        }[line.kind],
        marketplacePrice(line.amountPaisa),
      ]),
      ['Rent/services total', marketplacePrice(value.totalPaisa)],
      ['Security deposit due', marketplacePrice(value.securityDuePaisa ?? 0)],
      [
        'Total payable',
        marketplacePrice(
          value.outstandingPaisa +
            ((value.securityPendingPaisa ?? 0) > 0 ? 0 : (value.securityDuePaisa ?? 0)),
        ),
      ],
      ['Debit adjustments', marketplacePrice(value.debitAdjustmentsPaisa)],
      ['Credit adjustments', marketplacePrice(value.creditAdjustmentsPaisa)],
      ['Paid', marketplacePrice(value.allocatedPaisa)],
      ['Outstanding', marketplacePrice(value.outstandingPaisa)],
    ],
  };
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
export function financialDocumentHtml(document: FinancialDocument) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;color:${c.heading};padding:36px}h1{color:${c.primary}}
  td{padding:12px 8px;border-bottom:1px solid ${c.border};overflow-wrap:anywhere}td:last-child{text-align:right}
  table{width:100%;border-collapse:collapse}footer{margin-top:32px;font-size:12px}
  </style></head><body><h1>${escape(document.title)}</h1><h2>${escape(document.number)}</h2>
  <p>${escape(document.status)}</p><table>${document.rows.map(([label, value]) => `<tr><td>${escape(label)}</td><td>${escape(value)}</td></tr>`).join('')}</table>
  <footer>Resident payments are made directly to the hostel. HSM does not hold these funds.</footer></body></html>`;
}
