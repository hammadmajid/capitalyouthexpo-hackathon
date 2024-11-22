import { readResidentReceipt, type Database } from '@hsm/db';
import type { Actor } from '../authorization/store.js';
import { lockFinancialReadStay } from './financial-read-scope.js';
export class StayReceiptRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  staffDetail(actor: Actor, branchId: string, stayId: string, receiptId: string) {
    return this.detail(actor, stayId, receiptId, branchId);
  }
  customerDetail(actor: Actor, stayId: string, receiptId: string) {
    return this.detail(actor, stayId, receiptId);
  }
  private detail(actor: Actor, stayId: string, receiptId: string, branchId?: string) {
    return this.database.transaction(async (tx) => {
      const stay = await lockFinancialReadStay(tx, actor, stayId, this.clock, branchId);
      return readResidentReceipt(tx, { branchId: stay.branchId, stayId, receiptId });
    });
  }
}
