import { z } from 'zod';
import {
  DomainError,
  stayIdentifierSchema,
  stayReadQuerySchema,
  customerStayQuerySchema,
  stayPageSchema,
  stayDetailSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { StayReadRepository } from './read.repository.js';
const empty = z.object({}).strict();
function readResult<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new DomainError('INTERNAL', 500, 'Stay data unavailable');
  return result.data;
}
export class StayReadService {
  constructor(private readonly repository: StayReadRepository) {}
  async staffPage(actor: Actor, branchId: unknown, query: unknown) {
    return readResult(
      stayPageSchema,
      await this.repository.staffPage(
        actor,
        stayIdentifierSchema.parse(branchId),
        stayReadQuerySchema.parse(query),
      ),
    );
  }
  async customerPage(actor: Actor, query: unknown) {
    return readResult(
      stayPageSchema,
      await this.repository.customerPage(actor, customerStayQuerySchema.parse(query)),
    );
  }
  async staffDetail(actor: Actor, branchId: unknown, stayId: unknown, query: unknown = {}) {
    empty.parse(query);
    return readResult(
      stayDetailSchema,
      await this.repository.staffDetail(
        actor,
        stayIdentifierSchema.parse(branchId),
        stayIdentifierSchema.parse(stayId),
      ),
    );
  }
  async customerDetail(actor: Actor, stayId: unknown, query: unknown = {}) {
    empty.parse(query);
    return readResult(
      stayDetailSchema,
      await this.repository.customerDetail(actor, stayIdentifierSchema.parse(stayId)),
    );
  }
}
