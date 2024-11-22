import { z } from 'zod';
import { DomainError, residentReceiptDetailSchema, stayIdentifierSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { StayReceiptRepository } from './receipt.repository.js';
const empty = z.object({}).strict();
function result(value: unknown, stayId: string, receiptId: string, branchId?: string) {
  const parsed = residentReceiptDetailSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.receiptId !== receiptId ||
    parsed.data.snapshot.stayId !== stayId ||
    (branchId !== undefined && parsed.data.snapshot.branchId !== branchId)
  )
    throw new DomainError('INTERNAL', 500, 'Receipt data unavailable');
  return parsed.data;
}
export class StayReceiptService {
  constructor(private readonly repository: StayReceiptRepository) {}
  async staffDetail(
    actor: Actor,
    inputBranch: unknown,
    inputStay: unknown,
    inputReceipt: unknown,
    query: unknown = {},
  ) {
    empty.parse(query);
    const branchId = stayIdentifierSchema.parse(inputBranch),
      stayId = stayIdentifierSchema.parse(inputStay),
      receiptId = stayIdentifierSchema.parse(inputReceipt);
    return result(
      await this.repository.staffDetail(actor, branchId, stayId, receiptId),
      stayId,
      receiptId,
      branchId,
    );
  }
  async customerDetail(
    actor: Actor,
    inputStay: unknown,
    inputReceipt: unknown,
    query: unknown = {},
  ) {
    empty.parse(query);
    const stayId = stayIdentifierSchema.parse(inputStay),
      receiptId = stayIdentifierSchema.parse(inputReceipt);
    return result(
      await this.repository.customerDetail(actor, stayId, receiptId),
      stayId,
      receiptId,
    );
  }
}
