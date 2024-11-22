import { z } from 'zod';
import {
  DomainError,
  manualAdmissionCommandSchema,
  manualAdmissionResultSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { StayManualAdmissionRepository } from './manual-admission.repository.js';
import { splitManualCnic } from './resident-cnic.js';
export class StayManualAdmissionService {
  constructor(
    private readonly repository: StayManualAdmissionRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  async admit(actor: Actor, key: unknown, inputBranch: unknown, body: unknown) {
    const branchId = stayIdentifierSchema.parse(inputBranch),
      commandId = stayIdentifierSchema.parse(key),
      command = manualAdmissionCommandSchema.parse(body);
    const response = manualAdmissionResultSchema.refine(
      (value) =>
        value.branchId === branchId &&
        (command.manual.resident.kind !== 'existing' ||
          value.residentId === command.manual.resident.residentId),
    );
    try {
      const context = await this.repository.context(actor, branchId, command);
      return await this.idempotency.withStore(context.store).execute(
        { actor, key: commandId, endpoint: 'POST manual Stay admission', status: 201 },
        { branchId },
        { ...splitManualCnic(command).command, ...this.repository.fingerprint(command) },
        response,
        (tx) => this.repository.authorize(tx, actor, branchId, command, context.userId),
        () => this.repository.admit(requireTransaction(), actor, branchId, command, context.userId),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new DomainError('INTERNAL', 500, 'Admission response unavailable');
      return inventoryFailure(error);
    }
  }
}
