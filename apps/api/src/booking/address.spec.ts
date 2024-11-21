import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { users } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { requireBookingAddress } from './address.js';
const customerId = randomUUID();
it('AUTH-C-005: missing saved address prevents booking without writing identity', async () => {
  const store = queryFixture();
  store.enqueue(users, [{ permanentAddress: null }]);
  await expect(requireBookingAddress(store.transaction, customerId)).rejects.toMatchObject({
    code: 'VALIDATION_FAILED',
    status: 422,
  });
  expect(store.writes).toEqual([]);
});
it('AUTH-C-005: an existing valid address is reused without overwriting it', async () => {
  const store = queryFixture();
  store.enqueue(users, [{ permanentAddress: 'House 12, Islamabad' }]);
  await expect(requireBookingAddress(store.transaction, customerId)).resolves.toBeUndefined();
  expect(store.writes).toEqual([]);
});
it('AUTH-C-005 / SEC-003: supplied address is trimmed and written only to the Customer identity', async () => {
  const store = queryFixture();
  store.enqueue(users, [{ permanentAddress: null }]);
  await requireBookingAddress(store.transaction, customerId, '  House 12, Islamabad  ');
  expect(store.writes).toEqual([
    { table: users, kind: 'update', value: { permanentAddress: 'House 12, Islamabad' } },
  ]);
  expect(store.locks).toEqual([{ table: users, mode: 'update' }]);
});
it.each(['', '   ', 'abc', 'x'.repeat(501)])(
  'AUTH-C-005: invalid saved address is rejected: %s',
  async (permanentAddress) => {
    const store = queryFixture();
    store.enqueue(users, [{ permanentAddress }]);
    await expect(requireBookingAddress(store.transaction, customerId)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(store.writes).toEqual([]);
  },
);
it('ACC-002: a missing Customer identity cannot be recreated by submitting an address', async () => {
  const store = queryFixture();
  await expect(
    requireBookingAddress(store.transaction, customerId, 'House 12, Islamabad'),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(store.writes).toEqual([]);
});
