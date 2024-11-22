import { z } from 'zod';
import {
  hostelBasicsInputSchema,
  hostelOnboardingStateSchema,
  mainBranchDraftInputSchema,
  managementPageSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import { IdempotencyService } from '../idempotency/service.js';
import { HostelSetupRepository } from './hostel-setup.repository.js';
import type { SetupTarget } from './hostel-setup.scope.js';
const identifier = z.string().uuid();
export class HostelSetupService {
  constructor(
    private readonly repository: HostelSetupRepository,
    private readonly idempotency: IdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  read(actor: Actor, brandId: string) {
    return this.repository.read(actor, identifier.parse(brandId));
  }
  list(actor: Actor, organizationId: string, page: unknown) {
    return this.repository.list(
      actor,
      identifier.parse(organizationId),
      managementPageSchema.parse(page),
    );
  }
  create(actor: Actor, key: string, organizationId: string, body: unknown) {
    const input = hostelBasicsInputSchema.parse(body);
    return this.execute(
      actor,
      key,
      { kind: 'organization', id: organizationId },
      'POST /owner/organizations/:orgId/brands',
      input,
      201,
      (database, now) => this.repository.create(database, actor, organizationId, input, now),
    );
  }
  basics(actor: Actor, key: string, brandId: string, body: unknown) {
    const input = hostelBasicsInputSchema.parse(body);
    return this.execute(
      actor,
      key,
      { kind: 'brand', id: brandId },
      'PUT /owner/brands/:brandId/basics',
      input,
      200,
      (database, now) => this.repository.basics(database, actor, brandId, input, now),
    );
  }
  main(actor: Actor, key: string, brandId: string, body: unknown) {
    const input = mainBranchDraftInputSchema.parse(body);
    return this.execute(
      actor,
      key,
      { kind: 'brand', id: brandId },
      'PUT /owner/brands/:brandId/main-branch',
      input,
      200,
      (database, now) => this.repository.main(database, actor, brandId, input, now),
    );
  }
  submit(actor: Actor, key: string, brandId: string, body: unknown) {
    const input = z.object({}).strict().parse(body);
    return this.execute(
      actor,
      key,
      { kind: 'brand', id: brandId },
      'POST /owner/brands/:brandId/submit',
      input,
      200,
      (database, now) => this.repository.submit(database, actor, brandId, now),
    );
  }
  readBranch(actor: Actor, brandId: string, branchId: string) {
    return this.repository.readBranch(actor, identifier.parse(brandId), identifier.parse(branchId));
  }
  // BRN-001: add another branch under an owned hostel; it starts as a private draft.
  addBranch(actor: Actor, key: string, brandId: string, body: unknown) {
    const input = mainBranchDraftInputSchema.parse(body);
    return this.execute(
      actor,
      key,
      { kind: 'brand', id: brandId },
      'POST /owner/brands/:brandId/branches',
      input,
      201,
      (database, now) => this.repository.addBranch(database, actor, brandId, input, now),
    );
  }
  saveBranch(actor: Actor, key: string, brandId: string, branchId: string, body: unknown) {
    const input = mainBranchDraftInputSchema.parse(body),
      target = { brandId, branchId: identifier.parse(branchId) };
    return this.execute(
      actor,
      key,
      { kind: 'brand', id: brandId },
      'PUT /owner/brands/:brandId/branches/:branchId',
      { branchId: target.branchId, input },
      200,
      (database, now) => this.repository.saveBranch(database, actor, target, input, now),
    );
  }
  submitBranch(actor: Actor, key: string, brandId: string, branchId: string, body: unknown) {
    const input = z.object({}).strict().parse(body),
      target = { brandId, branchId: identifier.parse(branchId) };
    return this.execute(
      actor,
      key,
      { kind: 'brand', id: brandId },
      'POST /owner/brands/:brandId/branches/:branchId/submit',
      { branchId: target.branchId, input },
      200,
      (database, now) => this.repository.submitBranch(database, actor, target, now),
    );
  }
  private execute(
    actor: Actor,
    key: string,
    target: SetupTarget,
    endpoint: string,
    body: unknown,
    status: 200 | 201,
    work: (database: Transaction, now: Date) => Promise<unknown>,
  ) {
    identifier.parse(target.id);
    return this.idempotency.execute(
      { actor, key, endpoint, status },
      target,
      body,
      hostelOnboardingStateSchema,
      (database) =>
        this.repository.authorize(database, actor, target, endpoint.endsWith('/submit')),
      () => work(requireTransaction(), this.clock()),
    );
  }
}
