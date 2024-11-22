import { formatDate, type ResidentReceiptDetail } from '@hsm/contracts';
// PAY-009: a real single-page PDF rendered on demand from the immutable receipt snapshot,
// so later name, room or policy changes can never alter a historical receipt.
const PAGE_WIDTH = 595,
  PAGE_HEIGHT = 842,
  LINE = 16,
  MAX_CHARS = 86;
function money(paisa: number) {
  const rupees = paisa / 100;
  return (
    'PKR ' +
    new Intl.NumberFormat('en-PK', {
      minimumFractionDigits: paisa % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(rupees)
  );
}
// Standard Type 1 fonts carry Latin-1 only; other characters become '?' rather than corrupt
// the document. PDF string delimiters are escaped.
function pdfText(value: string) {
  return value
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}
function wrap(text: string) {
  const lines: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHARS) {
    const cut = rest.lastIndexOf(' ', MAX_CHARS);
    const at = cut > 20 ? cut : MAX_CHARS;
    lines.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  lines.push(rest);
  return lines;
}
export function receiptLines(detail: ResidentReceiptDetail) {
  const s = detail.snapshot;
  return [
    'Payment receipt ' + detail.receiptNumber,
    s.hostelName + ' - ' + s.branchName,
    '',
    'Resident: ' + s.residentName,
    'Amount received: ' + money(s.amountPaisa),
    'Method: ' +
      s.method.replace('_', ' ') +
      (s.transactionReference ? ' (ref ' + s.transactionReference + ')' : ''),
    'Paid on: ' + s.paidOn,
    'Approved: ' + formatDate(s.approvedAt),
    'Issued: ' + formatDate(detail.issuedAt),
    '',
    'Allocated to invoices: ' + money(s.distribution.allocatedPaisa),
    ...s.allocations.map((row) => '  ' + row.invoiceNumber + ': ' + money(row.amountPaisa)),
    'Security deposit: ' + money(s.distribution.depositPaisa),
    'Advance credit: ' + money(s.distribution.advanceCreditPaisa),
    '',
    ...(detail.reversed ? ['THIS PAYMENT WAS REVERSED BY THE HOSTEL OWNER.', ''] : []),
    'Paid directly to the hostel. HSM records this receipt; it does not hold or move money.',
  ].flatMap(wrap);
}
export function renderReceiptPdf(detail: ResidentReceiptDetail): Buffer {
  const lines = receiptLines(detail).slice(0, Math.floor((PAGE_HEIGHT - 120) / LINE));
  const body = lines
    .map(
      (line, index) =>
        `BT /F1 ${index === 0 ? 16 : 11} Tf 56 ${PAGE_HEIGHT - 72 - index * LINE} Td (${pdfText(line)}) Tj ET`,
    )
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`,
    `<< /Title (${pdfText('Receipt ' + detail.receiptNumber)}) /Producer (HSM) >>`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
