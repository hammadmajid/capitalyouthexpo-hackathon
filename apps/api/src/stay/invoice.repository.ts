import { withInvoiceComponents } from './invoice-components.js';
import { readInvoiceReferencePage } from './invoice-references.repository.js';
import { readResidentInvoiceBalance, type Database } from '@hsm/db';
import {
  databaseDateSchema,
  type StaffStayInvoiceReferenceQuery,
  type StayInvoiceReferenceQuery,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockFinancialReadStay } from './financial-read-scope.js';
function today(now: Date) {
  return databaseDateSchema.parse(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  );
}
export class StayInvoiceRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  staffList(actor: Actor, branchId: string, stayId: string, query: StaffStayInvoiceReferenceQuery) {
    return this.references(actor, stayId, query, branchId, query.category);
  }
  customerList(actor: Actor, stayId: string, query: StayInvoiceReferenceQuery) {
    return this.references(actor, stayId, query);
  }
  private references(
    actor: Actor,
    stayId: string,
    query: StayInvoiceReferenceQuery,
    branchId?: string,
    category?: 'transport' | 'other',
  ) {
    return this.database.transaction(async (tx) => {
      const scope = await lockFinancialReadStay(tx, actor, stayId, this.clock, branchId);
      return readInvoiceReferencePage(tx, scope.branchId, stayId, query, category);
    });
  }
  staffBalance(actor: Actor, branchId: string, stayId: string, invoiceId: string) {
    return this.database.transaction(async (tx) => {
      const stay = await lockFinancialReadStay(tx, actor, stayId, this.clock, branchId);
      const balance = await readResidentInvoiceBalance(tx, {
        branchId: stay.branchId,
        stayId,
        invoiceId,
        today: today(this.clock()),
      });
      return withInvoiceComponents(tx, stay.branchId, stayId, balance, this.clock());
    });
  }
  customerBalance(actor: Actor, stayId: string, invoiceId: string) {
    return this.database.transaction(async (tx) => {
      const stay = await lockFinancialReadStay(tx, actor, stayId, this.clock);
      const balance = await readResidentInvoiceBalance(tx, {
        branchId: stay.branchId,
        stayId,
        invoiceId,
        today: today(this.clock()),
      });
      return withInvoiceComponents(tx, stay.branchId, stayId, balance, this.clock());
    });
  }
}
