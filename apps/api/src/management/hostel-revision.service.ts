import { z } from 'zod';
import {
  hostelRevisionCommandSchema,
  hostelRevisionStateSchema,
  saveHostelRevisionSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import type { HostelSetupRepository } from './hostel-setup.repository.js';
import type { HostelRevisionRepository } from './hostel-revision.repository.js';
const identifier = z.string().uuid();
// CHG-041: Owner edits to an approved hostel. Same Owner checks as setup; the listing stays live.
export class HostelRevisionService {
  constructor(
    private readonly repository: HostelRevisionRepository,
    private readonly setup: HostelSetupRepository,
    private readonly idempotency: IdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  read(actor: Actor, brandId: string) {
    return this.repository.read(actor, identifier.parse(brandId));
  }
  save(actor: Actor, key: string, brandId: string, body: unknown) {
    const input = saveHostelRevisionSchema.parse(body);
    return this.execute(
      actor,
      key,
      brandId,
      'PUT /owner/brands/:brandId/revision',
      input,
      (tx, now) => this.repository.save(tx, actor, brandId, input, now),
    );
  }
  submit(actor: Actor, key: string, brandId: string, body: unknown) {
    const input = hostelRevisionCommandSchema.parse(body);
    return this.execute(
      actor,
      key,
      brandId,
      'POST /owner/brands/:brandId/revision/submit',
      input,
      (tx, now) => this.repository.submit(tx, actor, brandId, input.expectedVersion, now),
    );
  }
  withdraw(actor: Actor, key: string, brandId: string, body: unknown) {
    const input = hostelRevisionCommandSchema.parse(body);
    return this.execute(
      actor,
      key,
      brandId,
      'POST /owner/brands/:brandId/revision/withdraw',
      input,
      (tx, now) => this.repository.withdraw(tx, actor, brandId, input.expectedVersion, now),
    );
  }
  private execute(
    actor: Actor,
    key: string,
    brandId: string,
    endpoint: string,
    body: unknown,
    work: (tx: Transaction, now: Date) => Promise<unknown>,
  ) {
    const target = { kind: 'brand' as const, id: identifier.parse(brandId) };
    return this.idempotency.execute(
      { actor, key, endpoint, status: 200 },
      target,
      body,
      hostelRevisionStateSchema,
      // The hostel is already verified, so CNIC documents are not demanded again.
      (tx) => this.setup.authorize(tx, actor, target, false),
      () => work(requireTransaction(), this.clock()),
    );
  }
}
