import { expect, it, vi } from 'vitest';
import { stays } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import type { Actor } from '../authorization/store.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { StayLifecycleService } from './lifecycle.service.js';
import type { StayLifecycleRepository, LifecycleAct } from './lifecycle.repository.js';

const id = (n: number) => `10000000-0000-4000-8000-00000000000${n}`;
it.each(['repriced_transfer', 'checkout_with_deposit'] as const)(
  'SEC-001 / PAY-008 / AUD-003: replay denies revoked money-changing authority for %s',
  async (required) => {
    const f = queryFixture();
    f.enqueue(stays, [{ userId: null }]);
    const authorize = vi.fn(
      async (_tx: unknown, _actor: Actor, _branch: string, act: LifecycleAct) => {
        if (act === required) throw new DomainError('FORBIDDEN', 403, 'Required grant revoked');
        return {};
      },
    );
    const work = vi.fn();
    const execute = vi.fn(async (_command, _scope, _body, _schema, check) => {
      await check(f.transaction);
      return { status: 200, body: {}, replayed: true };
    });
    const service = new StayLifecycleService(
      f.database,
      { authorize, transfer: work, checkout: work } as unknown as StayLifecycleRepository,
      { withStore: () => ({ execute }) } as unknown as IdempotencyService,
    );
    const actor = { userId: id(9), sessionId: id(8) } as Actor;
    const command =
      required === 'repriced_transfer'
        ? service.transfer(actor, id(7), id(1), id(2), {
            expectedVersion: 1,
            reason: 'Agreed repricing',
            target: { kind: 'bed', roomId: id(3), bedId: id(4) },
            repricing: { rentAmountPaisa: 10000, residentAgreed: true },
          })
        : service.checkout(actor, id(7), id(1), id(2), {
            expectedVersion: 1,
            reason: 'Apply deposit',
            applyAvailableDeposit: true,
          });
    await expect(command).rejects.toMatchObject({ status: 403 });
    expect(authorize).toHaveBeenCalledWith(f.transaction, actor, id(1), required);
    expect(work).not.toHaveBeenCalled();
  },
);
