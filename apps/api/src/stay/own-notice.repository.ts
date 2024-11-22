import { recordResidentNotice } from '@hsm/db';
import { DomainError, stayIdentifierSchema, type stayNoticeInputSchema } from '@hsm/contracts';
import { NotificationProducer } from '@hsm/notifications';
import type { z } from 'zod';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockOwnNoticeAuthority } from './own-notice.scope.js';
export class OwnStayNoticeRepository {
  constructor(
    private readonly notices = new NotificationProducer(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(tx: Transaction, actor: Actor, stayId: string) {
    await lockOwnNoticeAuthority(tx, actor, stayId, this.clock);
    return true;
  }
  async submit(
    tx: Transaction,
    actor: Actor,
    stayId: string,
    notice: z.infer<typeof stayNoticeInputSchema>,
  ) {
    const own = await lockOwnNoticeAuthority(tx, actor, stayId, this.clock),
      now = this.clock();
    return recordResidentNotice(
      tx,
      {
        scope: { branchId: own.branchId, stayId, actorUserId: actor.userId, actorRole: 'customer' },
        notice,
      },
      now,
      async (sourceTx, scope, at) => {
        if (
          sourceTx !== tx ||
          scope.branchId !== own.branchId ||
          scope.stayId !== stayId ||
          scope.actorUserId !== actor.userId ||
          scope.actorRole !== 'customer' ||
          at.getTime() !== now.getTime()
        )
          throw new DomainError('INTERNAL', 500, 'Notice authority binding unavailable');
        const fresh = await lockOwnNoticeAuthority(sourceTx, actor, stayId, this.clock);
        if (fresh.branchId !== own.branchId)
          throw new DomainError('CONFLICT', 409, 'Stay scope changed; reload before notice');
      },
      async (sourceTx, event, at) => {
        if (
          sourceTx !== tx ||
          event.userId !== actor.userId ||
          event.stayId !== stayId ||
          at.getTime() !== now.getTime()
        )
          throw new DomainError('INTERNAL', 500, 'Notice delivery binding unavailable');
        const operationId = stayIdentifierSchema.parse(event.noticeId);
        await this.notices.enqueue(
          sourceTx,
          { userId: actor.userId, event: 'resident.notice_submitted', operationId },
          now,
        );
      },
    );
  }
}
