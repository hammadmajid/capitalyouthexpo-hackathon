import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { InventoryRepository } from './repository.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { InventoryService } from './service.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  roomId = randomUUID();
function fixture() {
  const execute = vi.fn();
  const repository = {
    authorize: vi.fn(),
    read: vi.fn(),
    room: vi.fn(),
    seat: vi.fn(),
    roomType: vi.fn(),
  };
  return {
    execute,
    repository,
    service: new InventoryService(
      repository as unknown as InventoryRepository,
      { execute } as unknown as IdempotencyService,
    ),
  };
}
it('BKG-003 ACC-001: database capacity conflicts become a safe typed conflict, not leaked SQL', async () => {
  const store = fixture();
  store.execute.mockRejectedValue(
    Object.assign(new Error('Private SQL diagnostics'), { code: '23514' }),
  );
  await expect(
    store.service.seat(actor, randomUUID(), branchId, roomId, { label: 'A', status: 'active' }),
  ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
});
it('BKG-004: invalid monetary input cannot reach a transactional mutation', () => {
  const store = fixture();
  expect(() =>
    store.service.roomType(actor, randomUUID(), branchId, {
      name: 'Two beds',
      capacity: 2,
      inventoryMode: 'both',
      bedMonthlyRentPaisa: 1.5,
      roomMonthlyRentPaisa: 3200000,
      depositPaisa: 0,
      fees: [],
    }),
  ).toThrow();
  expect(store.execute).not.toHaveBeenCalled();
});
it('ACC-001/004: callers cannot supply a durable ordinal or foreign branch parent in bed input', () => {
  const store = fixture();
  expect(() =>
    store.service.seat(actor, randomUUID(), branchId, roomId, {
      label: 'A',
      status: 'active',
      ordinal: 1,
    }),
  ).toThrow();
  expect(store.execute).not.toHaveBeenCalled();
});
