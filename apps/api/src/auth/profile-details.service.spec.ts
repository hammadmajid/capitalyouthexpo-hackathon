import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { ProfileDetailsService } from './profile-details.service.js';
import { profileDetailsFixture } from '../../test/profile-details-fixture.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() };
it('AUTH-C: edit details resolve only the live actor and preserve the strict self projection', async () => {
  const value = profileDetailsFixture(actor.userId),
    read = vi.fn(async () => value);
  expect(await new ProfileDetailsService({ read }).read(actor)).toEqual(value);
  expect(read).toHaveBeenCalledExactlyOnceWith(actor);
});
it('SEC: a different persisted identity cannot be returned from self edit details', async () => {
  const service = new ProfileDetailsService({ read: async () => profileDetailsFixture() });
  await expect(service.read(actor)).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
});
it('SEC: unexpected sensitive provider fields fail the projection boundary', async () => {
  const value = { ...profileDetailsFixture(actor.userId), cnicEncrypted: 'private' };
  await expect(
    new ProfileDetailsService({ read: async () => value }).read(actor),
  ).rejects.toThrow();
});
it('SEC: repository rejection cannot become an accepted profile', async () => {
  const failure = new Error('safe repository failure');
  await expect(
    new ProfileDetailsService({
      read: async () => {
        throw failure;
      },
    }).read(actor),
  ).rejects.toBe(failure);
});
