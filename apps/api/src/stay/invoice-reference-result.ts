import {
  DomainError,
  stayInvoiceReferencePageSchema,
  invoiceReferencePageMatches,
  type StayInvoiceReferenceQuery,
} from '@hsm/contracts';
export function invoiceReferenceResult(
  value: unknown,
  stayId: string,
  query: StayInvoiceReferenceQuery,
  branchId?: string,
) {
  const parsed = stayInvoiceReferencePageSchema.safeParse(value);
  if (!parsed.success || !invoiceReferencePageMatches(parsed.data, stayId, query, branchId))
    throw new DomainError('INTERNAL', 500, 'Invoice references unavailable');
  return parsed.data;
}
