import { beforeEach, expect, it, vi } from 'vitest';
import { lockInventoryBranch, stays } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { PgDialect } from 'drizzle-orm/pg-core';
import { lockActor } from '../auth/actor-lock.js';
import { lockOwnNoticeAuthority } from './own-notice.scope.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  noticeActor as actor,
  noticeIds as ids,
  noticeNow as now,
} from '../../test/unit/stay-own-notice.fixture.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  lockInventoryBranch: vi.fn(),
}));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
const hierarchy = {
  organization: {
    id: ids.user,
    ownerUserId: actor.userId,
    name: 'Fixture organization',
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  },
  brand: {
    id: ids.policy,
    organizationId: ids.user,
    name: 'Fixture hostel',
    logoFileId: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  },
  branch: {
    id: ids.branch,
    organizationId: ids.user,
    brandId: ids.policy,
    name: 'Fixture branch',
    slug: 'notice-fixture',
    category: null,
    cityId: null,
    areaId: null,
    subAreaId: null,
    addressLine: null,
    location: null,
    description: null,
    nearbyLandmark: null,
    propertyTier: null,
    establishmentYear: null,
    publicPhone: null,
    publicEmail: null,
    showPublicContact: false,
    messIncluded: false,
    messNotes: null,
    verificationStatus: 'draft',
    firstApprovedAt: null,
    listingHiddenAt: null,
    isPrimary: false,
    planStatus: 'free',
    completenessScore: null,
    ratingAvg: null,
    ratingCount: 0,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  },
} satisfies Awaited<ReturnType<typeof lockInventoryBranch>>;
const row = { id: ids.stay, branchId: ids.branch, userId: actor.userId };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockInventoryBranch).mockResolvedValue(hierarchy);
});
function fixture(probe: unknown[] = [row], locked: unknown[] = [row]) {
  const f = queryFixture();
  f.enqueue(stays, probe, locked);
  return { ...f, call: () => lockOwnNoticeAuthority(f.transaction, actor, ids.stay, () => now) };
}
it('OUT-001 / SEC-003: live identity, exact account linkage and hierarchy precede the protected Stay mutation scope', async () => {
  const f = fixture();
  expect(await f.call()).toEqual(row);
  expect(lockActor).toHaveBeenCalledTimes(2);
  expect(lockInventoryBranch).toHaveBeenCalledWith(f.transaction, ids.branch);
  expect(f.locks).toEqual([{ table: stays, mode: 'update' }]);
  const predicates = f.predicates.map((value) => new PgDialect().sqlToQuery(value.value).params);
  expect(predicates[0]).toEqual([ids.stay, actor.userId]);
  expect(predicates[1]).toEqual([ids.stay, ids.branch, actor.userId]);
  expect(f.writes).toHaveLength(0);
});
it('SEC-003: missing explicit own linkage returns opaque not-found before branch traversal', async () => {
  const f = fixture([]);
  await expect(f.call()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(lockInventoryBranch).not.toHaveBeenCalled();
  expect(f.locks).toHaveLength(0);
});
it.each([{ id: ids.policy }, { userId: ids.policy }, { userId: null }, { branchId: 'bad' }])(
  'SEC-003: malformed or transplanted own relationship is never trusted: %j',
  (change) => {
    const f = fixture([{ ...row, ...change }]);
    return expect(f.call()).rejects.toMatchObject({ code: 'INTERNAL' });
  },
);
it.each([
  {
    name: 'organization',
    value: { ...hierarchy, organization: { ...hierarchy.organization, archivedAt: now } },
  },
  { name: 'brand', value: { ...hierarchy, brand: { ...hierarchy.brand, archivedAt: now } } },
  { name: 'branch', value: { ...hierarchy, branch: { ...hierarchy.branch, archivedAt: now } } },
])('OUT-001: archived $name cannot accept a notice', async (changed) => {
  const f = fixture();
  vi.mocked(lockInventoryBranch).mockResolvedValue(changed.value);
  await expect(f.call()).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
  expect(f.locks).toHaveLength(0);
});
it('SEC-003: a changed relationship after hierarchy locking cannot authorize a mutation', async () => {
  const f = fixture([row], []);
  await expect(f.call()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(f.writes).toHaveLength(0);
});
it('SEC-003: a malformed locked producer row is never treated as authoritative', async () => {
  const f = fixture([row], [{ ...row, branchId: ids.policy }]);
  await expect(f.call()).rejects.toMatchObject({ code: 'INTERNAL' });
});
it('SEC-003: hierarchy must remain bound to the actual own Stay branch', async () => {
  const f = fixture();
  vi.mocked(lockInventoryBranch).mockResolvedValue({
    ...hierarchy,
    branch: { ...hierarchy.branch, id: ids.policy },
  });
  await expect(f.call()).rejects.toMatchObject({ code: 'INTERNAL' });
});
it('SEC-003: immediate actor rejection prevents all relationship and branch access', async () => {
  const f = fixture();
  vi.mocked(lockActor).mockRejectedValueOnce(
    new DomainError('UNAUTHENTICATED', 401, 'Session unavailable'),
  );
  await expect(f.call()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(f.predicates).toHaveLength(0);
  expect(lockInventoryBranch).not.toHaveBeenCalled();
});
