import { z } from 'zod';
import {
  calendarDateSchema,
  managementPageSchema,
  visitInterestInputSchema,
  visitInterestStateSchema,
  createVisitInputSchema,
  saveVisitingHoursSchema,
  visitActionInputSchema,
  visitListQuerySchema,
  visitSummarySchema,
  visitingHoursStateSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { VisitRepository } from './repository.js';
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class VisitService {
  constructor(
    private readonly repository: VisitRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  publicHours(slug: string, date: string) {
    return this.repository.publicHours(
      z.string().min(1).max(160).parse(slug),
      calendarDateSchema.parse(date),
    );
  }
  hours(actor: Actor, branchId: string) {
    return this.repository.hours(actor, identifier.parse(branchId));
  }
  list(actor: Actor, query: unknown, branchId?: string) {
    return this.repository.list(
      actor,
      visitListQuerySchema.parse(query),
      branchId ? identifier.parse(branchId) : undefined,
    );
  }
  history(actor: Actor, visitId: string, query: unknown, branchId?: string) {
    return this.repository.historyPage(
      actor,
      identifier.parse(visitId),
      managementPageSchema.parse(query),
      branchId ? identifier.parse(branchId) : undefined,
    );
  }
  interest(actor: Actor, visitId: string, branchId?: string) {
    return this.repository.interest(
      actor,
      identifier.parse(visitId),
      branchId ? identifier.parse(branchId) : undefined,
    );
  }
  recordInterest(actor: Actor, key: string, visitId: string, body: unknown) {
    const visit = identifier.parse(visitId),
      input = visitInterestInputSchema.parse(body);
    return this.idempotency.execute(
      { actor, key, endpoint: 'POST /me/visits/:visitId/interest', status: 200 },
      { visit },
      input,
      visitInterestStateSchema,
      (tx) => this.repository.authorize(tx, actor, undefined, visit),
      () => this.repository.recordInterest(requireTransaction(), actor, visit, input),
    );
  }
  saveHours(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = identifier.parse(branchId),
      input = saveVisitingHoursSchema.parse(body);
    return this.idempotency.execute(
      { actor, key, endpoint: 'PUT /branches/:branchId/visiting-hours', status: 200 },
      { branch },
      input,
      visitingHoursStateSchema,
      (tx) => this.repository.authorize(tx, actor, branch),
      () => this.repository.saveHours(requireTransaction(), actor, branch, input),
    );
  }
  create(actor: Actor, key: string, body: unknown) {
    const input = createVisitInputSchema.parse(body);
    return this.idempotency.execute(
      { actor, key, endpoint: 'POST /me/visits', status: 201 },
      { branch: input.branchId },
      input,
      visitSummarySchema,
      (tx) => this.repository.authorize(tx, actor),
      () =>
        this.repository.create(requireTransaction(), actor, input.branchId, input.requestedStart),
    );
  }
  action(actor: Actor, key: string, visitId: string, body: unknown, branchId?: string) {
    const visit = identifier.parse(visitId),
      branch = branchId ? identifier.parse(branchId) : undefined,
      input = visitActionInputSchema.parse(body);
    return this.idempotency.execute(
      {
        actor,
        key,
        endpoint: branch
          ? 'POST /branches/:branchId/visits/:visitId/actions'
          : 'POST /me/visits/:visitId/actions',
        status: 200,
      },
      { visit, branch: branch ?? null },
      input,
      visitSummarySchema,
      (tx) => this.repository.authorize(tx, actor, branch, visit),
      () => this.repository.action(requireTransaction(), actor, visit, input, branch),
    );
  }
}
