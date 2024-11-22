import { CustomAmenitiesRepository } from './custom-amenities.repository.js';
import { amenityScope } from './amenity-scope.js';
import { and, eq, inArray } from 'drizzle-orm';
import { amenities, branchAmenities, branches, type Database } from '@hsm/db';
import {
  DomainError,
  type ListingSettingsInput,
  type InventoryPermission,
  type AmenityCatalogQuery,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import { projectListing, readListingState, readAmenityCatalog } from './listing-state.js';
export class ListingRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  customAmenities() {
    return new CustomAmenitiesRepository(this.database, this.clock, this.audit);
  }
  async authorize(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    permission?: InventoryPermission,
  ) {
    await lockActor(transaction, actor, this.clock);
    const scope = await lockInventoryScope(transaction, actor, branchId, permission);
    await lockActor(transaction, actor, this.clock);
    return scope;
  }
  read(actor: Actor, branchId: string) {
    return this.database.transaction(async (transaction) => {
      const scope = await this.authorize(transaction, actor, branchId),
        access = await inventoryPermissions(
          transaction,
          actor,
          branchId,
          scope.actorRole === 'owner',
        ),
        state = await readListingState(transaction, branchId);
      await lockActor(transaction, actor, this.clock);
      return projectListing(branchId, state, access.permissions.includes('listing_edit'));
    });
  }
  catalog(query: AmenityCatalogQuery) {
    return this.database.transaction((transaction) => readAmenityCatalog(transaction, query));
  }
  private async requireCodes(
    transaction: Transaction,
    input: ListingSettingsInput,
    branchId: string,
    state: Awaited<ReturnType<typeof readListingState>>,
  ) {
    if (!input.amenityCodes.length) return;
    const rows = await transaction
      .select({ code: amenities.code, isActive: amenities.isActive })
      .from(amenities)
      .where(and(inArray(amenities.code, input.amenityCodes), amenityScope(transaction, branchId)))
      .orderBy(amenities.code)
      .for('share');
    const selected = new Set(state.selected.map((row) => row.code));
    if (
      rows.length !== input.amenityCodes.length ||
      rows.some((row) => !row.isActive && !selected.has(row.code))
    )
      throw new DomainError('VALIDATION_FAILED', 400, 'Choose approved amenity codes');
  }
  async save(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    expectedVersion: string,
    input: ListingSettingsInput,
  ) {
    const scope = await this.authorize(transaction, actor, branchId, 'listing_edit'),
      state = await readListingState(transaction, branchId),
      before = projectListing(branchId, state, true);
    if (before.version !== expectedVersion)
      throw new DomainError(
        'PRECONDITION_FAILED',
        412,
        'Listing changed; refresh the current settings',
      );
    await this.requireCodes(transaction, input, branchId, state);
    await lockActor(transaction, actor, this.clock);
    const { amenityCodes, ...fields } = input;
    await transaction
      .update(branches)
      .set({ ...fields, updatedAt: this.clock() })
      .where(eq(branches.id, branchId));
    await transaction.delete(branchAmenities).where(eq(branchAmenities.branchId, branchId));
    if (amenityCodes.length)
      await transaction
        .insert(branchAmenities)
        .values([...amenityCodes].sort().map((amenityCode) => ({ branchId, amenityCode })));
    const result = projectListing(branchId, await readListingState(transaction, branchId), true);
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'listing.settings.changed',
      targetType: 'branch',
      targetId: branchId,
      before,
      after: result,
      createdAt: this.clock(),
    });
    await lockActor(transaction, actor, this.clock);
    return result;
  }
}
