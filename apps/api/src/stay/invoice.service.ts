import {
  staffStayInvoiceReferenceQuerySchema,
  stayInvoiceReferenceQuerySchema,
} from '@hsm/contracts';
import { invoiceReferenceResult } from './invoice-reference-result.js';
import { z } from 'zod';
import { DomainError, residentInvoiceBalanceSchema, stayIdentifierSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { StayInvoiceRepository } from './invoice.repository.js';
const empty = z.object({}).strict();
function result(value: unknown, invoiceId: string) {
  const parsed = residentInvoiceBalanceSchema.safeParse(value);
  if (!parsed.success || parsed.data.invoiceId !== invoiceId)
    throw new DomainError('INTERNAL', 500, 'Invoice data unavailable');
  return parsed.data;
}
export class StayInvoiceService {
  constructor(private readonly repository: StayInvoiceRepository) {}
  async staffList(actor: Actor, branch: unknown, stay: unknown, value: unknown = {}) {
    const branchId = stayIdentifierSchema.parse(branch),
      stayId = stayIdentifierSchema.parse(stay),
      query = staffStayInvoiceReferenceQuerySchema.parse(value);
    return invoiceReferenceResult(
      await this.repository.staffList(actor, branchId, stayId, query),
      stayId,
      query,
      branchId,
    );
  }
  async customerList(actor: Actor, stay: unknown, value: unknown = {}) {
    const stayId = stayIdentifierSchema.parse(stay),
      query = stayInvoiceReferenceQuerySchema.parse(value);
    return invoiceReferenceResult(
      await this.repository.customerList(actor, stayId, query),
      stayId,
      query,
    );
  }
  async staffBalance(
    actor: Actor,
    branchId: unknown,
    stayId: unknown,
    invoiceId: unknown,
    query: unknown = {},
  ) {
    empty.parse(query);
    const exactInvoiceId = stayIdentifierSchema.parse(invoiceId);
    return result(
      await this.repository.staffBalance(
        actor,
        stayIdentifierSchema.parse(branchId),
        stayIdentifierSchema.parse(stayId),
        exactInvoiceId,
      ),
      exactInvoiceId,
    );
  }
  async customerBalance(actor: Actor, stayId: unknown, invoiceId: unknown, query: unknown = {}) {
    empty.parse(query);
    const exactInvoiceId = stayIdentifierSchema.parse(invoiceId);
    return result(
      await this.repository.customerBalance(
        actor,
        stayIdentifierSchema.parse(stayId),
        exactInvoiceId,
      ),
      exactInvoiceId,
    );
  }
}
