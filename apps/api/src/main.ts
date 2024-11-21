import { staffServices } from './staff/factory.js';
import { ProfileReviewService, assertProfileReviewSchema } from './admin/profile-review.service.js';
import { WaitlistRepository } from './waitlist/repository.js';
import { bookingCheckInService } from './stay/booking-check-in.factory.js';
import { occupancyService } from './stay/occupancy.service.js';
import { stayRecordService } from './stay/record.service.js';
import { residentService } from './stay/residents.service.js';
import { OwnStayNoticeService } from './stay/own-notice.service.js';
import { OwnStayNoticeRepository } from './stay/own-notice.repository.js';
import { rentBoardService } from './stay/rent-board.service.js';
import { stayLifecycleService } from './stay/lifecycle.service.js';
import { residentProofService } from './stay/proofs.service.js';
import { residentFeedback, residentServices } from './services/factory.js';
import { insights, platformAdmin, platformAdminReaders } from './admin/factory.js';
import { StayManualAdmissionService } from './stay/manual-admission.service.js';
import { StayManualAdmissionRepository } from './stay/manual-admission.repository.js';
import { bookingUpfrontService } from './booking/upfront.factory.js';
import { ChatRepository } from './chat/repository.js';
import { ChatService } from './chat/service.js';
import { startChatRealtime } from './chat/realtime.js';
import { WaitlistService } from './waitlist/service.js';
import { VisitRepository } from './visits/repository.js';
import { VisitService } from './visits/service.js';
import { StayReceiptRepository } from './stay/receipt.repository.js';
import { StayReceiptService } from './stay/receipt.service.js';
import { StayPaymentService } from './stay/payment.service.js';
import { StayPaymentRepository } from './stay/payment.repository.js';
import { StayInvoiceRepository } from './stay/invoice.repository.js';
import { StayInvoiceService } from './stay/invoice.service.js';
import { BillingCatalogRepository } from './stay/catalog.repository.js';
import { BillingCatalogService } from './stay/catalog.service.js';
import { StayReadRepository } from './stay/read.repository.js';
import { StayReadService } from './stay/read.service.js';
import { BillingPolicyService } from './stay/billing-policy.service.js';
import { BillingPolicyRepository } from './stay/billing-policy.repository.js';
import { ListingRulesRepository } from './inventory/listing-rules.repository.js';
import { ListingRulesService } from './inventory/listing-rules.service.js';
import { PublicListingRulesRepository } from './marketplace/listing-rules.repository.js';
import { PublicListingRulesService } from './marketplace/listing-rules.service.js';
import { RoomAmenitiesRepository } from './inventory/room-amenities.repository.js';
import { RoomAmenitiesService } from './inventory/room-amenities.service.js';
import { RoomLevelAmenitiesRepository } from './inventory/room-level-amenities.repository.js';
import { RoomLevelAmenitiesService } from './inventory/room-level-amenities.service.js';
import { propertyStructureService } from './inventory/property-structure.factory.js';
import { PublicGalleryService } from './marketplace/gallery.service.js';
import { PublicGalleryRepository } from './marketplace/gallery.repository.js';
import { InventoryGrantReadService } from './inventory/grants-read.service.js';
import { InventoryGrantReadRepository } from './inventory/grants-read.repository.js';
import { GalleryService } from './inventory/gallery.service.js';
import { GalleryRepository } from './inventory/gallery.repository.js';
import { ListingService } from './inventory/listing.service.js';
import { ListingRepository } from './inventory/listing.repository.js';
import { BookingDocumentService } from './booking/documents.service.js';
import { BookingDocumentRepository } from './booking/documents.repository.js';
import { BookingEvidenceService } from './booking/evidence.service.js';
import { InventoryBlockRepository } from './inventory/blocks.repository.js';
import { InventoryBlockService } from './inventory/blocks.service.js';
import { InboxRepository } from './inbox/repository.js';
import { InboxService } from './inbox/service.js';
import { z } from 'zod';
import { InventoryGrantRepository } from './inventory/grants.repository.js';
import { InventoryGrantService } from './inventory/grants.service.js';
import { FavoritesRepository } from './marketplace/favorites.repository.js';
import { FavoritesService } from './marketplace/favorites.service.js';
import { InstitutionRepository } from './marketplace/directory.repository.js';
import { InstitutionService } from './marketplace/directory.service.js';
import { MarketplaceRepository } from './marketplace/repository.js';
import { MarketplaceService } from './marketplace/service.js';
import { PublicListingMedia } from './marketplace/media.js';
import { BookingPolicyRepository } from './inventory/policy.repository.js';
import { BookingPolicyService } from './inventory/policy.service.js';
import { BookingRepository } from './booking/repository.js';
import { BookingService } from './booking/service.js';
import { BookingActionRepository } from './booking/actions.repository.js';
import { BookingActionService } from './booking/actions.service.js';
import { InventoryRepository } from './inventory/repository.js';
import { InventoryService } from './inventory/service.js';
import { InventoryImportService } from './inventory/import.service.js';
import { InventoryImportRepository } from './inventory/import.repository.js';
import { EmailAssociationRepository } from './auth/email-association.repository.js';
import { EmailAssociationService } from './auth/email-association.service.js';
import { ProfileDetailsRepository } from './auth/profile-details.repository.js';
import { ProfileDetailsService } from './auth/profile-details.service.js';
import { InvitationRepository } from './management/invitation.repository.js';
import { InvitationService } from './management/invitation.service.js';
import { HostelSetupRepository } from './management/hostel-setup.repository.js';
import { HostelSetupService } from './management/hostel-setup.service.js';
import { ManagerAcceptanceRepository } from './auth/manager-acceptance.repository.js';
import { ManagerAcceptanceService } from './auth/manager-acceptance.service.js';
import { apiTelemetry } from './observability/sdk.js';
import { installApiReporter, reportUnexpectedFailure } from './observability/reporter.js';
import { ManagementService } from './management/service.js';
import { ManagementReadRepository } from './management/read.repository.js';
import { StaffRepository } from './management/staff.repository.js';
import 'reflect-metadata';
import { S3Storage, storageConfig } from '@hsm/files';
import { FileRepository } from './files/repository.js';
import { FileService } from './files/service.js';
import { IdempotencyRepository } from './idempotency/repository.js';
import { IdempotencyService } from './idempotency/service.js';
import { randomBytes } from 'node:crypto';
import pino from 'pino';
import { parseEnvironment } from './config.js';
import { LiveInfrastructure } from './infrastructure.js';
import { createApplication } from './app.js';
import { AuthCrypto, hashPassword } from './auth/crypto.js';
import { AuthTransport } from './auth/transport.js';
import { SessionRepository } from './auth/session.repository.js';
import { SessionService } from './auth/session.service.js';
import { IdentityRepository } from './auth/identity.repository.js';
import { IdentityService } from './auth/identity.service.js';
import { OtpRepository } from './auth/otp.repository.js';
import { OwnerProfileRepository } from './auth/owner-profile.repository.js';
import { OwnerProfileService } from './auth/owner-profile.service.js';
import { CustomerProfileRepository } from './auth/customer-profile.repository.js';
import { CustomerProfileService } from './auth/customer-profile.service.js';
import { RegistrationRepository } from './auth/registration.repository.js';
import { RegistrationService } from './auth/registration.service.js';
import { OtpService } from './auth/otp.service.js';
import { ProfileRepository } from './auth/profile.repository.js';
import { ManagerRepository } from './auth/manager.repository.js';
import { ManagerService } from './auth/manager.service.js';
import { ScopeRepository } from './authorization/repository.js';
import { hostelRevisionServices } from './management/hostel-revision.factory.js';
const startupLogger = pino();
let telemetry: ReturnType<typeof apiTelemetry> | undefined;
let stopReporter: () => void = () => undefined;
try {
  const config = parseEnvironment(process.env);
  telemetry = apiTelemetry({
    environment: config.APP_ENV,
    service: 'api',
    dsn: process.env.SENTRY_DSN,
  });
  stopReporter = installApiReporter(telemetry.report);
  const storageOptions = storageConfig(process.env);
  const infrastructure = new LiveInfrastructure(config);
  await infrastructure.connect();
  const storage = new S3Storage(storageOptions);
  let closeRealtime: (() => Promise<void>) | undefined;
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
    const chatRepository = new ChatRepository(database, storageOptions.S3_PRIVATE_BUCKET);
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
        ...(config.VISITS_ENABLED
          ? { visits: new VisitService(new VisitRepository(database), idempotency) }
          : {}),
        waitlist: new WaitlistService(new WaitlistRepository(database), idempotency),
        chat: new ChatService(chatRepository, idempotency, storage),
        stays: new StayReadService(new StayReadRepository(database)),
        // Phase 4: actual admission routes are production-connected only with their live
        // stay/rent/finance authority, idempotency and transactional audit.
        manualAdmissions: new StayManualAdmissionService(
          new StayManualAdmissionRepository(
            database,
            undefined,
            (cnic) => crypto.protectCnic(cnic),
            storageOptions.S3_PRIVATE_BUCKET,
          ),
          idempotency,
        ),
        bookingCheckIns: bookingCheckInService(database, idempotency, undefined, (cnic) =>
          crypto.protectCnic(cnic),
        ),
        occupancy: occupancyService(database),
        stayRecords: stayRecordService(database, undefined, idempotency, {
          storage,
          bucket: storageOptions.S3_PRIVATE_BUCKET,
        }),
        residents: residentService(database),
        rentBoard: rentBoardService(database),
        stayLifecycle: stayLifecycleService(database, idempotency),
        // OUT-001/002: resident checkout notice; never releases the bed.
        ownStayNotices: new OwnStayNoticeService(new OwnStayNoticeRepository(), idempotency),
        residentProofs: residentProofService(
          database,
          idempotency,
          storage,
          storageOptions.S3_PRIVATE_BUCKET,
        ),
        // Phase 9: menu, transport, complaints and verified reviews.
        platformAdmin: platformAdmin(database, idempotency),
        ...(config.PROFILE_REVIEWS_ENABLED
          ? {
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
            }
          : {}),
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
        // Phase 7: staff-recorded external payments (finance_view + payment_record).
        stayPayments: new StayPaymentService(
          new StayPaymentRepository(database, storageOptions.S3_PRIVATE_BUCKET),
          idempotency,
        ),
        stayInvoices: new StayInvoiceService(new StayInvoiceRepository(database)),
        stayReceipts: new StayReceiptService(new StayReceiptRepository(database)),
        billingCatalog: new BillingCatalogService(
          new BillingCatalogRepository(database),
          idempotency,
        ),
        billingPolicies: new BillingPolicyService(
          new BillingPolicyRepository(
            database,
            undefined,
            undefined,
            storageOptions.S3_PRIVATE_BUCKET,
          ),
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
    const realtime = await startChatRealtime(
      app.getHttpServer(),
      chatRepository,
      sessions,
      config,
      infrastructure,
    );
    closeRealtime = realtime.close;
    // Fastify is already ready after createApplication, so hooks cannot be added here; the
    // shutdown-hook close path releases realtime and telemetry before the HTTP server.
    const closeApplication = app.close.bind(app);
    app.close = async () => {
      try {
        await realtime.close();
      } finally {
        stopReporter();
        await telemetry?.close();
      }
      await closeApplication();
    };
    await app.listen(config.API_PORT, config.API_HOST);
  } catch {
    await closeRealtime?.();
    storage.close();
    await infrastructure.close();
    throw new Error('API startup failed');
  }
} catch {
  reportUnexpectedFailure();
  await telemetry?.close();
  stopReporter();
  startupLogger.fatal({ code: 'STARTUP_FAILED' }, 'API refused startup');
  process.exitCode = 1;
}
