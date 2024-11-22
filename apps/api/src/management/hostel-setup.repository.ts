import { and, eq, gt, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import { brands, branches, type Database } from '@hsm/db';
import {
  DomainError,
  hostelPageSchema,
  type HostelBasicsInput,
  type MainBranchDraftInput,
  type ManagementPage,
} from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { captureVerification } from '../admin/verification-capture.js';
import {
  applyHostelBasics,
  applyMainDraft,
  newAdditionalBranch,
  newMainBranch,
  requireEditableDraft,
  requireSubmission,
  setupState,
} from './hostel-setup.policy.js';
import {
  lockSetupScope,
  requireOwnerSetupEvidence,
  requireSetupFile,
  type SetupTarget,
} from './hostel-setup.scope.js';
import {
  mainBranchValues,
  readHostelSetup,
  validateSetupGeography,
} from './hostel-setup.projection.js';
export class HostelSetupRepository {
  constructor(
    private readonly database: Database,
    private readonly bucket: string,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(
    database: Transaction,
    actor: Actor,
    target: SetupTarget,
    requireDocuments = true,
  ) {
    await lockSetupScope(database, actor, target);
    await requireOwnerSetupEvidence(database, actor, this.bucket, requireDocuments);
    return true;
  }
  read(actor: Actor, brandId: string) {
    return this.database.transaction(async (database) => {
      await lockActor(database, actor, this.clock);
      await lockSetupScope(database, actor, { kind: 'brand', id: brandId });
      return readHostelSetup(database, brandId);
    });
  }
  list(actor: Actor, organizationId: string, page: ManagementPage) {
    return this.database.transaction(async (database) => {
      await lockActor(database, actor, this.clock);
      await lockSetupScope(database, actor, { kind: 'organization', id: organizationId });
      const rows = await database
        .select({
          id: brands.id,
          organizationId: brands.organizationId,
          name: brands.name,
          logoFileId: brands.logoFileId,
        })
        .from(brands)
        .where(
          and(
            eq(brands.organizationId, organizationId),
            isNull(brands.archivedAt),
            page.cursor ? gt(brands.id, page.cursor) : undefined,
          ),
        )
        .orderBy(brands.id)
        .limit(page.limit + 1);
      const data = rows.slice(0, page.limit);
      return hostelPageSchema.parse({
        data,
        nextCursor: rows.length > page.limit ? data.at(-1)?.id : null,
      });
    });
  }
  private async logo(database: Transaction, actor: Actor, input: HostelBasicsInput) {
    if (input.logoFileId)
      await requireSetupFile(database, actor, this.bucket, input.logoFileId, 'listing_photo');
  }
  async create(
    database: Transaction,
    actor: Actor,
    organizationId: string,
    input: HostelBasicsInput,
    now: Date,
  ) {
    await this.logo(database, actor, input);
    const brandId = v7(),
      branch = newMainBranch(v7(), input);
    await database.insert(brands).values({
      id: brandId,
      organizationId,
      name: input.name,
      logoFileId: input.logoFileId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await database.insert(branches).values({
      id: branch.id,
      organizationId,
      brandId,
      slug: 'main-' + branch.id,
      isPrimary: true,
      createdAt: now,
      ...mainBranchValues(branch, now),
    });
    return this.record(database, actor, brandId, 'hostel.setup.create', now);
  }
  async basics(
    database: Transaction,
    actor: Actor,
    brandId: string,
    input: HostelBasicsInput,
    now: Date,
  ) {
    const hostel = await readHostelSetup(database, brandId);
    requireEditableDraft(hostel.mainBranch);
    await this.logo(database, actor, input);
    await database
      .update(brands)
      .set({
        name: input.name,
        updatedAt: now,
        ...(input.logoFileId !== undefined ? { logoFileId: input.logoFileId } : {}),
      })
      .where(eq(brands.id, brandId));
    if (hostel.mainBranch)
      await database
        .update(branches)
        .set(mainBranchValues(applyHostelBasics(hostel.mainBranch, input), now))
        .where(and(eq(branches.id, hostel.mainBranch.id), eq(branches.brandId, brandId)));
    if (!hostel.mainBranch) {
      const branch = newMainBranch(v7(), input);
      await database.insert(branches).values({
        id: branch.id,
        organizationId: hostel.organizationId,
        brandId,
        slug: 'main-' + branch.id,
        isPrimary: true,
        createdAt: now,
        ...mainBranchValues(branch, now),
      });
    }
    return this.record(database, actor, brandId, 'hostel.setup.basics', now);
  }
  async main(
    database: Transaction,
    actor: Actor,
    brandId: string,
    input: MainBranchDraftInput,
    now: Date,
  ) {
    const hostel = await readHostelSetup(database, brandId);
    const branch = applyMainDraft(
      hostel.mainBranch ?? newMainBranch(v7(), { name: hostel.name }),
      input,
    );
    await validateSetupGeography(database, branch);
    if (hostel.mainBranch)
      await database
        .update(branches)
        .set(mainBranchValues(branch, now))
        .where(and(eq(branches.id, branch.id), eq(branches.brandId, brandId)));
    else
      await database.insert(branches).values({
        id: branch.id,
        organizationId: hostel.organizationId,
        brandId,
        slug: 'main-' + branch.id,
        isPrimary: true,
        createdAt: now,
        ...mainBranchValues(branch, now),
      });
    return this.record(database, actor, brandId, 'hostel.setup.main-branch', now);
  }
  async submit(database: Transaction, actor: Actor, brandId: string, now: Date) {
    const hostel = await readHostelSetup(database, brandId);
    requireSubmission(hostel.mainBranch);
    await validateSetupGeography(database, hostel.mainBranch);
    await captureVerification(database, hostel.mainBranch.id, actor.userId, now);
    await database
      .update(branches)
      .set({ verificationStatus: 'submitted', updatedAt: now })
      .where(and(eq(branches.id, hostel.mainBranch.id), eq(branches.brandId, brandId)));
    return this.record(database, actor, brandId, 'hostel.setup.submit', now);
  }
  readBranch(actor: Actor, brandId: string, branchId: string) {
    return this.database.transaction(async (database) => {
      await lockActor(database, actor, this.clock);
      await lockSetupScope(database, actor, { kind: 'brand', id: brandId });
      return readHostelSetup(database, brandId, branchId);
    });
  }
  async addBranch(
    database: Transaction,
    actor: Actor,
    brandId: string,
    input: MainBranchDraftInput,
    now: Date,
  ) {
    const hostel = await readHostelSetup(database, brandId),
      branch = newAdditionalBranch(v7(), hostel.mainBranch, input);
    await validateSetupGeography(database, branch);
    await database.insert(branches).values({
      id: branch.id,
      organizationId: hostel.organizationId,
      brandId,
      slug: 'branch-' + branch.id,
      isPrimary: false,
      createdAt: now,
      ...mainBranchValues(branch, now),
    });
    return this.record(database, actor, brandId, 'hostel.setup.branch.create', now, branch.id);
  }
  async saveBranch(
    database: Transaction,
    actor: Actor,
    target: { brandId: string; branchId: string },
    input: MainBranchDraftInput,
    now: Date,
  ) {
    const hostel = await readHostelSetup(database, target.brandId, target.branchId);
    if (!hostel.mainBranch) throw new DomainError('NOT_FOUND', 404, 'Branch unavailable');
    const branch = applyMainDraft(hostel.mainBranch, input);
    await validateSetupGeography(database, branch);
    await database
      .update(branches)
      .set(mainBranchValues(branch, now))
      .where(and(eq(branches.id, branch.id), eq(branches.brandId, target.brandId)));
    return this.record(database, actor, target.brandId, 'hostel.setup.branch', now, branch.id);
  }
  async submitBranch(
    database: Transaction,
    actor: Actor,
    target: { brandId: string; branchId: string },
    now: Date,
  ) {
    const hostel = await readHostelSetup(database, target.brandId, target.branchId);
    requireSubmission(hostel.mainBranch);
    await validateSetupGeography(database, hostel.mainBranch);
    await captureVerification(database, hostel.mainBranch.id, actor.userId, now);
    await database
      .update(branches)
      .set({ verificationStatus: 'submitted', updatedAt: now })
      .where(and(eq(branches.id, hostel.mainBranch.id), eq(branches.brandId, target.brandId)));
    const action = 'hostel.setup.branch.submit';
    return this.record(database, actor, target.brandId, action, now, target.branchId);
  }
  private async record(
    database: Transaction,
    actor: Actor,
    brandId: string,
    action: string,
    now: Date,
    branchId?: string,
  ) {
    const hostel = await readHostelSetup(database, brandId, branchId),
      state = setupState(hostel);
    await this.audit.hostel(database, {
      actorUserId: actor.userId,
      actorRole: 'owner',
      action,
      targetType: 'brand',
      targetId: brandId,
      organizationId: hostel.organizationId,
      branchId: state.mainBranchId,
      after: state,
      createdAt: now,
    });
    return state;
  }
}
