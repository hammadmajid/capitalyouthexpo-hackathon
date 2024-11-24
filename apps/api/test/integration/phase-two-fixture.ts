import { bookingCheckInService } from '../../src/stay/booking-check-in.factory.js';
import { occupancyService } from '../../src/stay/occupancy.service.js';
import { stayRecordService } from '../../src/stay/record.service.js';
import { residentService } from '../../src/stay/residents.service.js';
import { rentBoardService } from '../../src/stay/rent-board.service.js';
import { stayLifecycleService } from '../../src/stay/lifecycle.service.js';
import { residentProofService } from '../../src/stay/proofs.service.js';
import { residentFeedback, residentServices } from '../../src/services/factory.js';
import { staffServices } from '../../src/staff/factory.js';
import { insights, platformAdmin } from '../../src/admin/factory.js';
import { bookingUpfrontService } from '../../src/booking/upfront.factory.js';
import { publishInventoryPhotos } from './inventory-photos.fixture.js';
import { WaitlistRepository } from '../../src/waitlist/repository.js';
import { ChatRepository } from '../../src/chat/repository.js';
import { ChatService } from '../../src/chat/service.js';
import { WaitlistService } from '../../src/waitlist/service.js';
import { VisitRepository } from '../../src/visits/repository.js';
import { VisitService } from '../../src/visits/service.js';
import { OwnStayNoticeRepository } from '../../src/stay/own-notice.repository.js';
import { OwnStayNoticeService } from '../../src/stay/own-notice.service.js';
import { StayManualAdmissionRepository } from '../../src/stay/manual-admission.repository.js';
import { StayManualAdmissionService } from '../../src/stay/manual-admission.service.js';
import { StayPaymentRepository } from '../../src/stay/payment.repository.js';
import { StayPaymentService } from '../../src/stay/payment.service.js';
import { StayReceiptRepository } from '../../src/stay/receipt.repository.js';
import { StayReceiptService } from '../../src/stay/receipt.service.js';
import { StayInvoiceRepository } from '../../src/stay/invoice.repository.js';
import { StayInvoiceService } from '../../src/stay/invoice.service.js';
import { BillingCatalogRepository } from '../../src/stay/catalog.repository.js';
import { BillingCatalogService } from '../../src/stay/catalog.service.js';
import { StayReadRepository } from '../../src/stay/read.repository.js';
import { StayReadService } from '../../src/stay/read.service.js';
import { BillingPolicyRepository } from '../../src/stay/billing-policy.repository.js';
import { BillingPolicyService } from '../../src/stay/billing-policy.service.js';
import { ListingRulesRepository } from '../../src/inventory/listing-rules.repository.js';
import { ListingRulesService } from '../../src/inventory/listing-rules.service.js';
import { PublicListingRulesRepository } from '../../src/marketplace/listing-rules.repository.js';
import { PublicListingRulesService } from '../../src/marketplace/listing-rules.service.js';
import { RoomAmenitiesRepository } from '../../src/inventory/room-amenities.repository.js';
import { RoomAmenitiesService } from '../../src/inventory/room-amenities.service.js';
import { propertyStructureService } from '../../src/inventory/property-structure.factory.js';
import { PublicGalleryService } from '../../src/marketplace/gallery.service.js';
import { PublicGalleryRepository } from '../../src/marketplace/gallery.repository.js';
import { InventoryGrantReadService } from '../../src/inventory/grants-read.service.js';
import { InventoryGrantReadRepository } from '../../src/inventory/grants-read.repository.js';
import { InventoryGrantRepository } from '../../src/inventory/grants.repository.js';
import { InventoryGrantService } from '../../src/inventory/grants.service.js';
import { GalleryService } from '../../src/inventory/gallery.service.js';
import { GalleryRepository } from '../../src/inventory/gallery.repository.js';
import { ListingService } from '../../src/inventory/listing.service.js';
import { ListingRepository } from '../../src/inventory/listing.repository.js';
import { InventoryBlockRepository } from '../../src/inventory/blocks.repository.js';
import { InventoryBlockService } from '../../src/inventory/blocks.service.js';
import { BookingDocumentService } from '../../src/booking/documents.service.js';
import { BookingDocumentRepository } from '../../src/booking/documents.repository.js';
import { BookingEvidenceService } from '../../src/booking/evidence.service.js';
import { InboxRepository } from '../../src/inbox/repository.js';
import { InboxService } from '../../src/inbox/service.js';
import { randomUUID } from 'node:crypto';
import type { StartedTestContainer } from 'testcontainers';
import { objectStorageStack, storageStack } from '@hsm/test-support';
import {
  users,
  organizations,
  brands,
  branches,
  cities,
  areas,
  roomTypes,
  rooms,
  seats,
  bookingPolicies,
  customerProfiles,
} from '@hsm/db';
import { AuthCrypto, hashPassword } from '../../src/auth/crypto.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
import { InventoryRepository } from '../../src/inventory/repository.js';
import { InventoryService } from '../../src/inventory/service.js';
import { InventoryImportService } from '../../src/inventory/import.service.js';
import { InventoryImportRepository } from '../../src/inventory/import.repository.js';
import { BookingRepository } from '../../src/booking/repository.js';
import { BookingService } from '../../src/booking/service.js';
import { BookingActionRepository } from '../../src/booking/actions.repository.js';
import { BookingActionService } from '../../src/booking/actions.service.js';
import { BookingPolicyRepository } from '../../src/inventory/policy.repository.js';
import { BookingPolicyService } from '../../src/inventory/policy.service.js';
import { MarketplaceRepository } from '../../src/marketplace/repository.js';
import { MarketplaceService } from '../../src/marketplace/service.js';
import { PublicListingMedia } from '../../src/marketplace/media.js';
import { FavoritesRepository } from '../../src/marketplace/favorites.repository.js';
import { FavoritesService } from '../../src/marketplace/favorites.service.js';
import { InstitutionRepository } from '../../src/marketplace/directory.repository.js';
import { InstitutionService } from '../../src/marketplace/directory.service.js';
export const fixturePolicy = {
  bookingMode: 'instant',
  holdSeconds: 600,
  requestExpirySeconds: 3600,
  requestReservesInventory: true,
  minimumStayDays: 1,
  maximumStayDays: 365,
  minimumAdvanceDays: 0,
  maximumAdvanceDays: 365,
  customerSelectsInventory: true,
  cancellationAllowed: true,
  cancellationCutoffHours: 0,
  allowedStayUnits: ['day', 'week', 'month'],
  requiredDocuments: [],
  allowEvidenceReuse: true,
  documentReviewRequired: false,
};
export const fixtureLimits = {
  maximumHoldSeconds: 3600,
  maximumActiveHolds: 3,
  maximumRequestExpirySeconds: 86400,
  maximumAdvanceDays: 365,
  maximumFiniteStayDays: 730,
};
export async function phaseTwoFixture(
  now: Date,
  clock: () => Date = () => new Date(now.getTime()),
  options?: { preScannedInventory: true },
) {
  const containers: StartedTestContainer[] = [];
  const bootStorage = options?.preScannedInventory ? objectStorageStack : storageStack;
  const storage = await bootStorage(containers);
  const crypto = new AuthCrypto(testKeys());
  let auth: Awaited<ReturnType<typeof authFixture>> | undefined;
  try {
    auth = await authFixture(crypto, now, {}, [], (database, idempotency) => {
      const market = new MarketplaceRepository(database, storage.bucket, 5000, clock);
      return {
        inventoryImports: new InventoryImportService(
          new InventoryImportRepository(
            database,
            storage.storage,
            storage.bucket,
            undefined,
            clock,
          ),
          idempotency,
        ),
        visits: new VisitService(new VisitRepository(database, undefined, clock), idempotency),
        listingRules: new ListingRulesService(
          new ListingRulesRepository(database, undefined, clock),
          idempotency,
        ),
        publicListingRules: new PublicListingRulesService(
          new PublicListingRulesRepository(database),
        ),
        propertyStructure: propertyStructureService(database, idempotency, clock),
        roomAmenities: new RoomAmenitiesService(
          new RoomAmenitiesRepository(database, undefined, clock),
          idempotency,
        ),
        listingSettings: new ListingService(
          new ListingRepository(database, undefined, clock),
          idempotency,
        ),
        inventoryGrants: new InventoryGrantService(
          new InventoryGrantRepository(undefined, clock),
          idempotency,
        ),
        inventoryGrantRead: new InventoryGrantReadService(
          new InventoryGrantReadRepository(database, undefined, clock),
        ),
        publicGallery: new PublicGalleryService(
          new PublicGalleryRepository(database, storage.bucket),
        ),
        gallery: new GalleryService(
          new GalleryRepository(database, storage.bucket, undefined, clock),
          idempotency,
        ),
        inventoryBlocks: new InventoryBlockService(
          new InventoryBlockRepository(database, undefined, clock),
          idempotency,
        ),
        waitlist: new WaitlistService(new WaitlistRepository(database, clock), idempotency),
        chat: new ChatService(
          new ChatRepository(database, storage.bucket, clock),
          idempotency,
          storage.storage,
        ),
        inbox: new InboxService(new InboxRepository(database, clock), idempotency),
        inventory: new InventoryService(
          new InventoryRepository(database, undefined, clock),
          idempotency,
        ),
        bookingDocuments: new BookingDocumentService(
          new BookingDocumentRepository(database, storage.bucket, undefined, clock),
          idempotency,
        ),
        bookingEvidence: new BookingEvidenceService(
          database,
          storage.storage,
          storage.bucket,
          clock,
        ),
        bookings: new BookingService(
          new BookingRepository(database, storage.bucket, crypto, undefined, clock),
          idempotency,
        ),
        bookingActions: new BookingActionService(
          new BookingActionRepository(database, undefined, clock, storage.bucket),
          idempotency,
        ),
        bookingUpfront: bookingUpfrontService(
          database,
          storage.bucket,
          storage.storage,
          idempotency,
          clock,
        ),
        stays: new StayReadService(new StayReadRepository(database, clock)),
        ownStayNotices: new OwnStayNoticeService(
          new OwnStayNoticeRepository(undefined, clock),
          idempotency,
        ),
        bookingCheckIns: bookingCheckInService(database, idempotency, clock, (cnic) =>
          crypto.protectCnic(cnic),
        ),
        occupancy: occupancyService(database, clock),
        stayRecords: stayRecordService(database, clock, idempotency, {
          storage: storage.storage,
          bucket: storage.bucket,
        }),
        residents: residentService(database, clock),
        rentBoard: rentBoardService(database, clock),
        stayLifecycle: stayLifecycleService(database, idempotency, clock),
        residentProofs: residentProofService(
          database,
          idempotency,
          storage.storage,
          storage.bucket,
          clock,
        ),
        platformAdmin: platformAdmin(database, idempotency, clock),
        insights: insights(database, clock),
        residentServices: residentServices(database, idempotency, clock),
        staff: staffServices(database, idempotency, storage.storage, storage.bucket, clock),
        residentFeedback: residentFeedback(
          database,
          idempotency,
          storage.storage,
          storage.bucket,
          clock,
        ),
        manualAdmissions: new StayManualAdmissionService(
          new StayManualAdmissionRepository(
            database,
            clock,
            (cnic) => crypto.protectCnic(cnic),
            storage.bucket,
          ),
          idempotency,
        ),
        stayInvoices: new StayInvoiceService(new StayInvoiceRepository(database, clock)),
        stayReceipts: new StayReceiptService(new StayReceiptRepository(database, clock)),
        stayPayments: new StayPaymentService(
          new StayPaymentRepository(database, storage.bucket, undefined, clock),
          idempotency,
        ),
        billingCatalog: new BillingCatalogService(
          new BillingCatalogRepository(database, undefined, clock),
          idempotency,
        ),
        billingPolicies: new BillingPolicyService(
          new BillingPolicyRepository(database, undefined, clock, storage.bucket),
          idempotency,
        ),
        bookingPolicies: new BookingPolicyService(
          new BookingPolicyRepository(database, undefined, clock),
          idempotency,
        ),
        marketplace: new MarketplaceService(
          market,
          new PublicListingMedia(database, storage.storage, storage.bucket),
        ),
        favorites: new FavoritesService(
          new FavoritesRepository(database, market, clock),
          idempotency,
        ),
        institutions: new InstitutionService(
          new InstitutionRepository(undefined, clock),
          idempotency,
        ),
      };
    });
    const ownerId = randomUUID(),
      customerA = randomUUID(),
      customerB = randomUUID(),
      organizationId = randomUUID(),
      brandId = randomUUID();
    const cityId = randomUUID(),
      areaId = randomUUID(),
      policyId = randomUUID();
    const database = auth.connection.db;
    const passwordHash = await hashPassword('Correct test fixture password 2026');
    await database.insert(users).values(
      [ownerId, customerA, customerB].map((id, index) => ({
        id,
        fullName: 'Phase two fixture',
        permanentAddress: index === 0 ? null : 'House 12, Islamabad',
        email: id + '@example.test',
        emailVerifiedAt: now,
        passwordHash,
        gender: 'male' as const,
        phoneE164: '+92300123456' + String(index + 1),
      })),
    );
    await database
      .insert(customerProfiles)
      .values(
        [customerA, customerB].map((userId) => ({ userId, age: 20, profileCompletedAt: now })),
      );
    await database
      .insert(organizations)
      .values({ id: organizationId, ownerUserId: ownerId, name: 'Phase two fixture' });
    await database
      .insert(brands)
      .values({ id: brandId, organizationId, name: 'Phase two fixture' });
    await database
      .insert(cities)
      .values({ id: cityId, name: 'Islamabad test fixture', slug: cityId });
    await database
      .insert(areas)
      .values({ id: areaId, cityId, level: 'area', name: 'Fixture area', slug: areaId });
    await database.insert(bookingPolicies).values({
      id: policyId,
      policy: fixturePolicy,
      platformLimits: fixtureLimits,
      isCurrent: true,
      createdByUserId: ownerId,
    });
    const current = auth;
    const tokens = await Promise.all(
      [ownerId, customerA, customerB].map((id) => current.service.issue(id, 'mobile')),
    );
    const [ownerSession, customerASession, customerBSession] = tokens;
    if (!ownerSession || !customerASession || !customerBSession)
      throw new Error('Fixture sessions missing');
    return {
      ...current,
      storage,
      crypto,
      now,
      ownerId,
      customerA,
      customerB,
      organizationId,
      brandId,
      cityId,
      areaId,
      policyId,
      ownerToken: ownerSession.accessToken,
      customerAToken: customerASession.accessToken,
      customerBToken: customerBSession.accessToken,
      async inventory(options: { photos?: boolean } = {}) {
        const branchId = randomUUID(),
          roomTypeId = randomUUID(),
          roomId = randomUUID(),
          seatId = randomUUID(),
          otherSeatId = randomUUID();
        await database.insert(branches).values({
          id: branchId,
          organizationId,
          brandId,
          name: 'Approved integration fixture',
          slug: branchId,
          category: 'boys',
          cityId,
          areaId,
          addressLine: 'Integration fixture address',
          location: 'SRID=4326;POINT(73.0479 33.6844)',
          verificationStatus: 'approved',
          firstApprovedAt: now,
        });
        await database.insert(roomTypes).values({
          id: roomTypeId,
          branchId,
          name: 'Two beds',
          capacity: 2,
          inventoryMode: 'both',
          bedMonthlyRentPaisa: 1800000n,
          roomMonthlyRentPaisa: 3200000n,
          depositPaisa: 0n,
        });
        await database
          .insert(rooms)
          .values({ id: roomId, roomTypeId, branchId, label: '101', status: 'active' });
        await database.insert(seats).values([
          { id: seatId, branchId, roomId, ordinal: 1, label: 'A', status: 'active' },
          { id: otherSeatId, branchId, roomId, ordinal: 2, label: 'B', status: 'active' },
        ]);
        if (options.photos !== false)
          await publishInventoryPhotos(database, {
            bucket: storage.bucket,
            ownerId,
            branchId,
            roomId,
            seatIds: [seatId, otherSeatId],
            now,
          });
        return {
          branchId,
          roomTypeId,
          roomId,
          seatId,
          otherSeatId,
        };
      },
      async close() {
        await current.close();
        storage.close();
        for (const container of containers.reverse()) await container.stop();
      },
    };
  } catch (error) {
    await auth?.close();
    storage.close();
    for (const container of containers.reverse()) await container.stop();
    throw error;
  }
}
