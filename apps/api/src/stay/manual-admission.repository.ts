import { requireAdmissionCnicPhoto, attachAdmissionCnicPhoto } from './admission-cnic-photo.js';
import { admitManualResident, type Database } from '@hsm/db';
import {
  DomainError,
  manualAdmissionResultSchema,
  type ManualAdmissionCommand,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import {
  lockManualAdmissionAuthority,
  manualAdmissionCommandContext,
} from './manual-admission.scope.js';
import {
  cnicFingerprint,
  requireProtector,
  splitManualCnic,
  type CnicProtector,
} from './resident-cnic.js';
export class StayManualAdmissionRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
    private readonly protect?: CnicProtector,
    private readonly bucket?: string,
  ) {}
  // CHG-054: the idempotency fingerprint carries the keyed CNIC hash, never the number.
  fingerprint(command: ManualAdmissionCommand) {
    return cnicFingerprint(splitManualCnic(command).cnic, this.protect);
  }
  context(actor: Actor, branchId: string, command: ManualAdmissionCommand) {
    return manualAdmissionCommandContext(
      this.database,
      actor,
      branchId,
      command.manual.resident,
      this.clock,
    );
  }
  async authorize(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    command: ManualAdmissionCommand,
    userId: string | null,
  ) {
    await lockManualAdmissionAuthority(
      tx,
      actor,
      branchId,
      command.manual.resident,
      this.clock,
      userId,
    );
    return true;
  }
  async admit(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    command: ManualAdmissionCommand,
    userId: string | null,
  ) {
    const scope = await lockManualAdmissionAuthority(
      tx,
      actor,
      branchId,
      command.manual.resident,
      this.clock,
      userId,
    );
    if (command.cnicPhotoFileId)
      await requireAdmissionCnicPhoto(tx, actor, command.cnicPhotoFileId, this.bucket);
    const split = splitManualCnic(command);
    const cnic = split.cnic === undefined ? null : requireProtector(this.protect)(split.cnic);
    const result = await admitManualResident(
      tx,
      {
        cnic,
        scope: {
          organizationId: scope.organizationId,
          branchId,
          actorUserId: actor.userId,
          actorRole: scope.actorRole,
        },
        manual: split.command.manual,
        initialBilling: command.initialBilling,
        expectedUserId: userId,
      },
      this.clock(),
      async (sourceTx, input) => {
        if (
          sourceTx !== tx ||
          input.scope.branchId !== branchId ||
          input.scope.actorUserId !== actor.userId ||
          input.scope.organizationId !== scope.organizationId ||
          input.scope.actorRole !== scope.actorRole ||
          input.expectedUserId !== userId
        )
          throw new DomainError('INTERNAL', 500, 'Admission authority binding unavailable');
        await this.authorize(sourceTx, actor, branchId, command, userId);
      },
    );
    if (command.cnicPhotoFileId)
      await attachAdmissionCnicPhoto(
        tx,
        actor,
        scope,
        branchId,
        result.residentId,
        command.cnicPhotoFileId,
        this.clock(),
      );
    return manualAdmissionResultSchema.parse({ branchId, ...result });
  }
}
