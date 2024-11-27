import type { ResidentProof } from '@hsm/contracts';
// CHG-050: the bills a proof pays, as "INV-1 + INV-T" (one number for a single bill).
export function proofBills(
  proof: Pick<ResidentProof, 'invoiceNumber' | 'invoices' | 'depositPaisa'>,
) {
  const bills = (
    proof.invoices ?? (proof.invoiceNumber ? [{ invoiceNumber: proof.invoiceNumber }] : [])
  )
    .map((row) => row.invoiceNumber)
    .join(' + ');
  return [bills, (proof.depositPaisa ?? 0) > 0 ? 'Security deposit' : '']
    .filter(Boolean)
    .join(' + ');
}
