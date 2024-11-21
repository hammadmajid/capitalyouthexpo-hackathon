import { staffServices } from '../dist/staff/factory.js';
import {
  ProfileReviewService,
  assertProfileReviewSchema,
} from '../dist/admin/profile-review.service.js';
import { bookingCheckInService } from '../dist/stay/booking-check-in.factory.js';
import { occupancyService } from '../dist/stay/occupancy.service.js';
import { stayRecordService } from '../dist/stay/record.service.js';
import { residentService } from '../dist/stay/residents.service.js';
import { rentBoardService } from '../dist/stay/rent-board.service.js';
import { stayLifecycleService } from '../dist/stay/lifecycle.service.js';
import { residentProofService } from '../dist/stay/proofs.service.js';
import { residentFeedback, residentServices } from '../dist/services/factory.js';
import { insights, platformAdmin, platformAdminReaders } from '../dist/admin/factory.js';
import { bookingUpfrontService } from '../dist/booking/upfront.factory.js';
import { WaitlistRepository } from '../dist/waitlist/repository.js';
import { ChatRepository } from '../dist/chat/repository.js';
import { ChatService } from '../dist/chat/service.js';
import { WaitlistService } from '../dist/waitlist/service.js';
import { VisitRepository } from '../dist/visits/repository.js';
import { VisitService } from '../dist/visits/service.js';
import { StayPaymentRepository } from '../dist/stay/payment.repository.js';
import { StayPaymentService } from '../dist/stay/payment.service.js';
import { OwnStayNoticeRepository } from '../dist/stay/own-notice.repository.js';
import { OwnStayNoticeService } from '../dist/stay/own-notice.service.js';
import { StayManualAdmissionRepository } from '../dist/stay/manual-admission.repository.js';
import { StayManualAdmissionService } from '../dist/stay/manual-admission.service.js';
import { StayReceiptRepository } from '../dist/stay/receipt.repository.js';
import { StayReceiptService } from '../dist/stay/receipt.service.js';
import { StayInvoiceRepository } from '../dist/stay/invoice.repository.js';
import { StayInvoiceService } from '../dist/stay/invoice.service.js';
import { BillingCatalogRepository } from '../dist/stay/catalog.repository.js';
import { BillingCatalogService } from '../dist/stay/catalog.service.js';
import { StayReadRepository } from '../dist/stay/read.repository.js';
import { StayReadService } from '../dist/stay/read.service.js';
import { BillingPolicyService } from '../dist/stay/billing-policy.service.js';
import { BillingPolicyRepository } from '../dist/stay/billing-policy.repository.js';
import { ListingRulesRepository } from '../dist/inventory/listing-rules.repository.js';
import { ListingRulesService } from '../dist/inventory/listing-rules.service.js';
import { PublicListingRulesRepository } from '../dist/marketplace/listing-rules.repository.js';
import { PublicListingRulesService } from '../dist/marketplace/listing-rules.service.js';
import { RoomAmenitiesRepository } from '../dist/inventory/room-amenities.repository.js';
import { RoomAmenitiesService } from '../dist/inventory/room-amenities.service.js';
import { RoomLevelAmenitiesRepository } from '../dist/inventory/room-level-amenities.repository.js';
import { RoomLevelAmenitiesService } from '../dist/inventory/room-level-amenities.service.js';
import { propertyStructureService } from '../dist/inventory/property-structure.factory.js';
import { PublicGalleryService } from '../dist/marketplace/gallery.service.js';
import { PublicGalleryRepository } from '../dist/marketplace/gallery.repository.js';
import { InventoryGrantReadService } from '../dist/inventory/grants-read.service.js';
import { InventoryGrantReadRepository } from '../dist/inventory/grants-read.repository.js';
import { GalleryService } from '../dist/inventory/gallery.service.js';
import { GalleryRepository } from '../dist/inventory/gallery.repository.js';
import { ListingService } from '../dist/inventory/listing.service.js';
import { ListingRepository } from '../dist/inventory/listing.repository.js';
import { BookingDocumentService } from '../dist/booking/documents.service.js';
import { BookingDocumentRepository } from '../dist/booking/documents.repository.js';
import { BookingEvidenceService } from '../dist/booking/evidence.service.js';
import { InventoryBlockRepository } from '../dist/inventory/blocks.repository.js';
import { InventoryBlockService } from '../dist/inventory/blocks.service.js';
import { InboxRepository } from '../dist/inbox/repository.js';
import { InboxService } from '../dist/inbox/service.js';
import { z } from 'zod';
import { InventoryGrantRepository } from '../dist/inventory/grants.repository.js';
import { InventoryGrantService } from '../dist/inventory/grants.service.js';
import { FavoritesRepository } from '../dist/marketplace/favorites.repository.js';
import { FavoritesService } from '../dist/marketplace/favorites.service.js';
import { InstitutionRepository } from '../dist/marketplace/directory.repository.js';
import { InstitutionService } from '../dist/marketplace/directory.service.js';
import { MarketplaceRepository } from '../dist/marketplace/repository.js';
import { MarketplaceService } from '../dist/marketplace/service.js';
import { PublicListingMedia } from '../dist/marketplace/media.js';
import { BookingPolicyRepository } from '../dist/inventory/policy.repository.js';
import { BookingPolicyService } from '../dist/inventory/policy.service.js';
import { BookingRepository } from '../dist/booking/repository.js';
import { BookingService } from '../dist/booking/service.js';
import { BookingActionRepository } from '../dist/booking/actions.repository.js';
import { BookingActionService } from '../dist/booking/actions.service.js';
import { InventoryRepository } from '../dist/inventory/repository.js';
import { InventoryService } from '../dist/inventory/service.js';
import { InventoryImportService } from '../dist/inventory/import.service.js';
import { InventoryImportRepository } from '../dist/inventory/import.repository.js';
import { EmailAssociationRepository } from '../dist/auth/email-association.repository.js';
import { EmailAssociationService } from '../dist/auth/email-association.service.js';
import { ProfileDetailsRepository } from '../dist/auth/profile-details.repository.js';
import { ProfileDetailsService } from '../dist/auth/profile-details.service.js';
import { InvitationRepository } from '../dist/management/invitation.repository.js';
import { InvitationService } from '../dist/management/invitation.service.js';
import { HostelSetupRepository } from '../dist/management/hostel-setup.repository.js';
import { HostelSetupService } from '../dist/management/hostel-setup.service.js';
import { ManagerAcceptanceRepository } from '../dist/auth/manager-acceptance.repository.js';
import { ManagerAcceptanceService } from '../dist/auth/manager-acceptance.service.js';
import { ManagementService } from '../dist/management/service.js';
import { ManagementReadRepository } from '../dist/management/read.repository.js';
import { StaffRepository } from '../dist/management/staff.repository.js';
import 'reflect-metadata';
import { S3Storage, storageConfig } from '@hsm/files';
import { FileRepository } from '../dist/files/repository.js';
import { FileService } from '../dist/files/service.js';
import { IdempotencyRepository } from '../dist/idempotency/repository.js';
import { IdempotencyService } from '../dist/idempotency/service.js';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApiDocument } from '../dist/documentation.js';
import { parseEnvironment } from '../dist/config.js';
import { LiveInfrastructure } from '../dist/infrastructure.js';
import { createApplication } from '../dist/app.js';
import { AuthCrypto, hashPassword } from '../dist/auth/crypto.js';
import { AuthTransport } from '../dist/auth/transport.js';
import { SessionRepository } from '../dist/auth/session.repository.js';
import { SessionService } from '../dist/auth/session.service.js';
import { IdentityRepository } from '../dist/auth/identity.repository.js';
import { IdentityService } from '../dist/auth/identity.service.js';
import { OtpRepository } from '../dist/auth/otp.repository.js';
import { OwnerProfileRepository } from '../dist/auth/owner-profile.repository.js';
import { OwnerProfileService } from '../dist/auth/owner-profile.service.js';
import { CustomerProfileRepository } from '../dist/auth/customer-profile.repository.js';
import { CustomerProfileService } from '../dist/auth/customer-profile.service.js';
import { RegistrationRepository } from '../dist/auth/registration.repository.js';
import { RegistrationService } from '../dist/auth/registration.service.js';
import { OtpService } from '../dist/auth/otp.service.js';
import { ProfileRepository } from '../dist/auth/profile.repository.js';
import { ManagerRepository } from '../dist/auth/manager.repository.js';
import { ManagerService } from '../dist/auth/manager.service.js';
import { ScopeRepository } from '../dist/authorization/repository.js';
import { hostelRevisionServices } from '../dist/management/hostel-revision.factory.js';

try {
  const config = parseEnvironment({
    APP_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://offline:offline@127.0.0.1:1/offline',
    REDIS_URL: 'redis://127.0.0.1:1',
    CORS_ORIGINS: 'http://localhost:3000',
    JWT_SECRET: randomBytes(48).toString('hex'),
    CNIC_HASH_KEY: randomBytes(32).toString('hex'),
    CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  });
  const storageOptions = storageConfig({
    S3_ENDPOINT: 'http://127.0.0.1:1',
    S3_REGION: 'us-east-1',
    S3_PRIVATE_BUCKET: 'offline-contract',
    S3_ACCESS_KEY_ID: randomBytes(24).toString('hex'),
    S3_SECRET_ACCESS_KEY: randomBytes(32).toString('hex'),
  });
  const infrastructure = new LiveInfrastructure(config);
  // Metadata generation constructs real providers without connecting to infrastructure.
  const storage = new S3Storage(storageOptions);
  try {
    const crypto = new AuthCrypto(config);
    const database = infrastructure.database.db;
    const sessions = new SessionService(new SessionRepository(database), crypto);
    const otp = new OtpService(new OtpRepository(database), crypto);
    const profiles = new ProfileRepository(database, config.PROFILE_REVIEWS_ENABLED);
    if (config.PROFILE_REVIEWS_ENABLED) await assertProfileReviewSchema(database);
    const owner = new OwnerProfileService(
      new OwnerProfileRepository(database, storageOptions.S3_PRIVATE_BUCKET),
      crypto,
      profiles,
    );
    const customer = new CustomerProfileService(
      new CustomerProfileRepository(database, storageOptions.S3_PRIVATE_BUCKET),
      profiles,
    );
    const registration = new RegistrationService(
      new RegistrationRepository(database),
      crypto,
      sessions,
      profiles,
    );
    const managerAcceptance = new ManagerAcceptanceService(
      new ManagerAcceptanceRepository(database, undefined, undefined),
      profiles,
    );
    const dummyHash = await hashPassword(randomBytes(48).toString('hex'));
    const managers = new ManagerService(
      new ManagerRepository(database),
      sessions,
      profiles,
      dummyHash,
    );
    const identity = new IdentityService(
      new IdentityRepository(database),
      sessions,
      otp,
      crypto,
      profiles,
      dummyHash,
    );
    const transport = new AuthTransport(crypto, ['staging', 'production'].includes(config.APP_ENV));
    const idempotency = new IdempotencyService(new IdempotencyRepository(database));
    const app = await createApplication(
      config,
      infrastructure,
      [],
      {
        sessions,
        otp,
        emailAssociation: new EmailAssociationService(
          new EmailAssociationRepository(database),
          otp,
          profiles,
        ),
        registration,
        customer,
        owner,
        profileDetails: new ProfileDetailsService(new ProfileDetailsRepository(database)),
        identity,
        transport,
        profiles,
        managers,
        managerAcceptance,
        scopes: new ScopeRepository(database),
      },
      {
        idempotency,
        inventoryBlocks: new InventoryBlockService(
          new InventoryBlockRepository(database),
          idempotency,
        ),
        inbox: new InboxService(new InboxRepository(database), idempotency),
        inventoryGrants: new InventoryGrantService(new InventoryGrantRepository(), idempotency),
        inventoryGrantRead: new InventoryGrantReadService(
          new InventoryGrantReadRepository(database),
        ),
        institutions: new InstitutionService(new InstitutionRepository(), idempotency),
        favorites: new FavoritesService(
          new FavoritesRepository(
            database,
            new MarketplaceRepository(
              database,
              storageOptions.S3_PRIVATE_BUCKET,
              config.MARKETPLACE_TEXT_RADIUS_METERS,
            ),
          ),
          idempotency,
        ),
        publicGallery: new PublicGalleryService(
          new PublicGalleryRepository(database, storageOptions.S3_PRIVATE_BUCKET),
        ),
        marketplace: new MarketplaceService(
          new MarketplaceRepository(
            database,
            storageOptions.S3_PRIVATE_BUCKET,
            z.coerce
              .number()
              .int()
              .min(100)
              .max(200000)
              .default(5000)
              .parse(process.env.MARKETPLACE_TEXT_RADIUS_METERS),
          ),
          new PublicListingMedia(database, storage, storageOptions.S3_PRIVATE_BUCKET),
        ),
        stayPayments: new StayPaymentService(
          new StayPaymentRepository(database, storageOptions.S3_PRIVATE_BUCKET),
          idempotency,
        ),
        visits: new VisitService(new VisitRepository(database), idempotency),
        waitlist: new WaitlistService(new WaitlistRepository(database), idempotency),
        chat: new ChatService(
          new ChatRepository(database, storageOptions.S3_PRIVATE_BUCKET),
          idempotency,
          storage,
        ),
        stays: new StayReadService(new StayReadRepository(database)),
        ownStayNotices: new OwnStayNoticeService(new OwnStayNoticeRepository(), idempotency),
        bookingCheckIns: bookingCheckInService(database, idempotency),
        occupancy: occupancyService(database),
        stayRecords: stayRecordService(database),
        residents: residentService(database),
        rentBoard: rentBoardService(database),
        stayLifecycle: stayLifecycleService(database, idempotency),
        residentProofs: residentProofService(
          database,
          idempotency,
          storage,
          storageOptions.S3_PRIVATE_BUCKET,
        ),
        platformAdmin: platformAdmin(database, idempotency),
        profileReviews: new ProfileReviewService(
          {
            database,
            idempotency,
            crypto,
            bucket: storageOptions.S3_PRIVATE_BUCKET,
            clock: () => new Date(),
          },
          { storage, bucket: storageOptions.S3_PRIVATE_BUCKET },
        ),
        ...platformAdminReaders(
          database,
          { storage, bucket: storageOptions.S3_PRIVATE_BUCKET },
          undefined,
          idempotency,
        ),
        insights: insights(database),
        residentServices: residentServices(database, idempotency),
        staff: staffServices(database, idempotency, storage, storageOptions.S3_PRIVATE_BUCKET),
        hostelRevisions: hostelRevisionServices(
          database,
          idempotency,
          storageOptions.S3_PRIVATE_BUCKET,
        ),
        residentFeedback: residentFeedback(
          database,
          idempotency,
          storage,
          storageOptions.S3_PRIVATE_BUCKET,
        ),
        manualAdmissions: new StayManualAdmissionService(
          new StayManualAdmissionRepository(database),
          idempotency,
        ),
        stayInvoices: new StayInvoiceService(new StayInvoiceRepository(database)),
        stayReceipts: new StayReceiptService(new StayReceiptRepository(database)),
        billingCatalog: new BillingCatalogService(
          new BillingCatalogRepository(database),
          idempotency,
        ),
        billingPolicies: new BillingPolicyService(
          new BillingPolicyRepository(database),
          idempotency,
        ),
        bookingPolicies: new BookingPolicyService(
          new BookingPolicyRepository(database),
          idempotency,
        ),
        bookingDocuments: new BookingDocumentService(
          new BookingDocumentRepository(database, storageOptions.S3_PRIVATE_BUCKET),
          idempotency,
        ),
        bookingEvidence: new BookingEvidenceService(
          database,
          storage,
          storageOptions.S3_PRIVATE_BUCKET,
        ),
        bookings: new BookingService(
          new BookingRepository(database, storageOptions.S3_PRIVATE_BUCKET, crypto),
          idempotency,
        ),
        bookingActions: new BookingActionService(
          new BookingActionRepository(
            database,
            undefined,
            undefined,
            storageOptions.S3_PRIVATE_BUCKET,
          ),
          idempotency,
        ),
        bookingUpfront: bookingUpfrontService(
          database,
          storageOptions.S3_PRIVATE_BUCKET,
          storage,
          idempotency,
        ),
        inventory: new InventoryService(new InventoryRepository(database), idempotency),
        inventoryImports: new InventoryImportService(
          new InventoryImportRepository(database, storage, storageOptions.S3_PRIVATE_BUCKET),
          idempotency,
        ),
        listingRules: new ListingRulesService(new ListingRulesRepository(database), idempotency),
        publicListingRules: new PublicListingRulesService(
          new PublicListingRulesRepository(database),
        ),
        roomAmenities: new RoomAmenitiesService(new RoomAmenitiesRepository(database), idempotency),
        roomLevelAmenities: new RoomLevelAmenitiesService(
          new RoomLevelAmenitiesRepository(database),
          idempotency,
        ),
        propertyStructure: propertyStructureService(database, idempotency),
        listingSettings: new ListingService(new ListingRepository(database), idempotency),
        gallery: new GalleryService(
          new GalleryRepository(database, storageOptions.S3_PRIVATE_BUCKET),
          idempotency,
        ),
        invitations: new InvitationService(new InvitationRepository(database), crypto),
        hostelSetup: new HostelSetupService(
          new HostelSetupRepository(database, storageOptions.S3_PRIVATE_BUCKET, undefined),
          idempotency,
        ),
        management: new ManagementService(
          new ManagementReadRepository(database),
          new StaffRepository(database),
        ),
        files: new FileService(
          new FileRepository(database, storageOptions.S3_PRIVATE_BUCKET),
          storage,
        ),
      },
    );
    try {
      const output = new URL('../.generated/', import.meta.url);
      await mkdir(output, { recursive: true });
      await writeFile(
        new URL('openapi.json', output),
        JSON.stringify(createApiDocument(app), null, 2) + String.fromCharCode(10),
      );
    } finally {
      await app.close();
    }
  } catch (error) {
    storage.close();
    await infrastructure.close();
    const location =
      error instanceof Error ? error.stack?.split('\n').slice(1, 4).join('\n') : undefined;
    throw new Error('API startup failed' + (location ? '\n' + location : ''));
  }
} catch (error) {
  const location =
    error instanceof Error ? error.stack?.split('\n').slice(1, 5).join('\n') : undefined;
  throw new Error('OpenAPI generation failed' + (location ? '\n' + location : ''));
}
