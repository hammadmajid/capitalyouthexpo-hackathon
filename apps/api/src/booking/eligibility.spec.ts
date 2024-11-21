import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { branches, customerProfiles } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { publicBranch } from './projection.js';
import { BookingRepository } from './repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./projection.js', () => ({
  publicBranch: vi.fn(),
  bookingPage: vi.fn(),
  bookingProjection: vi.fn(),
}));
const branchId = randomUUID(),
  actor = { userId: randomUUID(), sessionId: randomUUID() };
const now = new Date('2026-10-15T10:00:00Z');
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(publicBranch).mockResolvedValue({ id: branchId });
});
function fixture(gender: string, category: string) {
  const store = queryFixture();
  // Unit-only completed profile; credentials and real PostgreSQL constraints have separate suites.
  store.enqueue(customerProfiles, [
    {
      completedAt: now,
      verifiedAt: now,
      email: 'customer@example.test',
      passwordHash: 'encoded fixture',
      fullName: 'Test customer',
      phone: '+923001234567',
      gender,
      status: 'active',
      age: 20,
    },
  ]);
  store.enqueue(branches, [{ category }]);
  return {
    ...store,
    repository: new BookingRepository(store.database, 'private', {
      protectCnic: vi.fn(),
      equals: vi.fn(),
    }),
  };
}
const cases = ['boys', 'girls', 'working_male', 'working_female'].flatMap((category) =>
  ['male', 'female', 'other'].map((gender) => ({
    category,
    gender,
    compatible:
      (['boys', 'working_male'].includes(category) && gender === 'male') ||
      (['girls', 'working_female'].includes(category) && gender === 'female'),
  })),
);
it.each(cases)(
  'BKG-001 / SRS p21: $gender profile / $category eligibility is $compatible',
  async ({ gender, category, compatible }) => {
    const store = fixture(gender, category);
    const result = store.repository.authorize(store.transaction, actor, branchId);
    if (compatible) await expect(result).resolves.toBe(true);
    else await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN' });
  },
);
it('ACC-002 / BKG-001: an unpublished branch remains opaque before category checks', async () => {
  const store = fixture('female', 'boys');
  vi.mocked(publicBranch).mockResolvedValue(undefined);
  await expect(
    store.repository.authorize(store.transaction, actor, branchId),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
