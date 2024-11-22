import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  managerInvitationInputSchema,
  managerCredentialInputSchema,
  managerInvitationStateSchema,
  managerInvitationResponseSchema,
  type ManagerCredentialInput,
  type ManagerInvitationInput,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuthCrypto, hashPassword } from '../auth/crypto.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { InvitationRepository } from './invitation.repository.js';
const identifier = z.string().uuid();
export class InvitationService {
  constructor(
    private readonly repository: InvitationRepository,
    private readonly crypto: Pick<AuthCrypto, 'digest'>,
    private readonly clock: () => Date = () => new Date(),
    private readonly hash: (password: string) => Promise<string> = hashPassword,
    private readonly generate: () => string = () => randomBytes(24).toString('base64url'),
  ) {}
  async invite(actor: Actor, key: string, branchId: string, body: unknown) {
    identifier.parse(branchId);
    const input = managerInvitationInputSchema.parse(body);
    const targetId = await this.repository.resolve(input.phone);
    const credential = await this.credential(input);
    return this.execute(
      actor,
      key,
      branchId,
      targetId,
      input,
      credential,
      'POST /manage/branches/:branchId/managers',
      undefined,
    );
  }
  async reset(actor: Actor, key: string, branchId: string, assignmentId: string, body: unknown) {
    identifier.parse(branchId);
    identifier.parse(assignmentId);
    const input = managerCredentialInputSchema.parse(body);
    const targetId = await this.repository.resolveAssignment(branchId, assignmentId);
    return this.execute(
      actor,
      key,
      branchId,
      targetId,
      input,
      await this.credential(input),
      'POST /manage/branches/:branchId/managers/:assignmentId/reset-temp-password',
      assignmentId,
    );
  }
  private async credential(input: ManagerCredentialInput) {
    if (input.temporaryCredential.mode === 'manual')
      return { hash: await this.hash(input.temporaryCredential.password), generated: undefined };
    const generated = this.generate();
    return { hash: await this.hash(generated), generated };
  }
  private requestFingerprint(input: ManagerCredentialInput | ManagerInvitationInput) {
    if (input.temporaryCredential.mode === 'auto') return input;
    return {
      ...input,
      temporaryCredential: {
        mode: 'manual',
        digest: this.crypto.digest(input.temporaryCredential.password, 'invitation_request'),
      },
    };
  }
  private async execute(
    actor: Actor,
    key: string,
    branchId: string,
    targetId: string,
    input: ManagerCredentialInput | ManagerInvitationInput,
    credential: { hash: string; generated: string | undefined },
    endpoint: string,
    assignmentId: string | undefined,
  ) {
    const service = new IdempotencyService(this.repository.store(targetId), this.clock);
    const result = await service.execute(
      { actor, key, endpoint, status: assignmentId ? 200 : 201 },
      { branchId, ...(assignmentId ? { assignmentId } : {}) },
      this.requestFingerprint(input),
      managerInvitationStateSchema,
      async (database) => {
        await this.repository.authorize(database, actor, branchId);
        if (assignmentId)
          await this.repository.requireReset(database, branchId, assignmentId, targetId);
        return true;
      },
      () =>
        assignmentId
          ? this.repository.reset(
              requireTransaction(),
              actor,
              branchId,
              assignmentId,
              targetId,
              credential.hash,
              this.clock(),
            )
          : this.repository.invite(
              requireTransaction(),
              actor,
              branchId,
              targetId,
              managerInvitationInputSchema.parse(input),
              credential.hash,
              this.clock(),
            ),
    );
    // Plaintext is returned only by the initial successful auto-generated issuance.
    // It is never persisted in the idempotency response or disclosed on replay.
    const generatedTempPassword =
      !result.replayed && result.body.acceptance === 'temporary_password'
        ? credential.generated
        : undefined;
    return {
      ...result,
      body: managerInvitationResponseSchema.parse({
        ...result.body,
        ...(generatedTempPassword ? { generatedTempPassword } : {}),
      }),
    };
  }
}
