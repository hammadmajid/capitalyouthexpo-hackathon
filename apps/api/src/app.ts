import { inventoryControllers } from './inventory/controllers.js';
import { installProfileCompatibility } from './auth/profile-compatibility.js';
import { WaitlistController, WAITLIST_SERVICE } from './waitlist/controller.js';
import { ChatController, CHAT_SERVICE } from './chat/controller.js';
import { BranchChatController } from './chat/branch.controller.js';
import {
  BranchChatReportController,
  ChatSafetyReportsController,
  CustomerChatReportController,
} from './chat/report.controller.js';
import type { ChatService } from './chat/service.js';
import { limitChat } from './chat/rate-limit.js';
import { WaitlistVacancyController } from './waitlist/vacancy.controller.js';
import type { WaitlistService } from './waitlist/service.js';
import { VisitController, VISIT_SERVICE } from './visits/controller.js';
import type { VisitService } from './visits/service.js';
import { OwnStayNoticeController, OWN_STAY_NOTICE_SERVICE } from './stay/own-notice.controller.js';
import type { OwnStayNoticeService } from './stay/own-notice.service.js';
import {
  StayManualAdmissionController,
  STAY_MANUAL_ADMISSION_SERVICE,
} from './stay/manual-admission.controller.js';
import type { StayManualAdmissionService } from './stay/manual-admission.service.js';
import {
  BookingCheckInController,
  BOOKING_CHECK_IN_SERVICE,
} from './stay/booking-check-in.controller.js';
import type { BookingCheckInService } from './stay/booking-check-in.service.js';
import { OccupancyController, OCCUPANCY_SERVICE } from './stay/occupancy.controller.js';
import type { OccupancyService } from './stay/occupancy.service.js';
import { StayRecordController, STAY_RECORD_SERVICE } from './stay/record.controller.js';
import type { StayRecordService } from './stay/record.service.js';
import { residentControllers, RESIDENT_SERVICE } from './stay/resident-controllers.js';
import type { ResidentService } from './stay/residents.service.js';
import { RentBoardController, RENT_BOARD_SERVICE } from './stay/rent-board.controller.js';
import type { RentBoardService } from './stay/rent-board.service.js';
import { StayLifecycleController, STAY_LIFECYCLE_SERVICE } from './stay/lifecycle.controller.js';
import type { StayLifecycleService } from './stay/lifecycle.service.js';
import { ResidentProofController, RESIDENT_PROOF_SERVICE } from './stay/proofs.controller.js';
import {
  phaseNineTenControllers,
  phaseNineTenProviders,
  type PhaseNineTenServices,
} from './phase-nine-ten.js';
import type { ResidentProofService } from './stay/proofs.service.js';
import { STAY_PAYMENT_CONTROLLERS, STAY_PAYMENT_SERVICE } from './stay/payment-controllers.js';
import type { StayPaymentService } from './stay/payment.service.js';
import { StayReceiptController, STAY_RECEIPT_SERVICE } from './stay/receipt.controller.js';
import type { StayReceiptService } from './stay/receipt.service.js';
import { StayInvoiceController, STAY_INVOICE_SERVICE } from './stay/invoice.controller.js';
import type { StayInvoiceService } from './stay/invoice.service.js';
import { BillingCatalogController, BILLING_CATALOG_SERVICE } from './stay/catalog.controller.js';
import type { BillingCatalogService } from './stay/catalog.service.js';
import { StayReadController, STAY_READ_SERVICE } from './stay/read.controller.js';
import type { StayReadService } from './stay/read.service.js';
import {
  BillingPolicyController,
  BILLING_POLICY_SERVICE,
} from './stay/billing-policy.controller.js';
import type { BillingPolicyService } from './stay/billing-policy.service.js';
import {
  ListingRulesController,
  LISTING_RULES_SERVICE,
} from './inventory/listing-rules.controller.js';
import type { ListingRulesService } from './inventory/listing-rules.service.js';
import {
  PublicListingRulesController,
  PUBLIC_LISTING_RULES_SERVICE,
} from './marketplace/listing-rules.controller.js';
import type { PublicListingRulesService } from './marketplace/listing-rules.service.js';
import {
  RoomAmenitiesController,
  ROOM_AMENITIES_SERVICE,
} from './inventory/room-amenities.controller.js';
import type { RoomAmenitiesService } from './inventory/room-amenities.service.js';
import {
  RoomLevelAmenitiesController,
  ROOM_LEVEL_AMENITIES_SERVICE,
} from './inventory/room-level-amenities.controller.js';
import type { RoomLevelAmenitiesService } from './inventory/room-level-amenities.service.js';
import {
  PropertyStructureController,
  PROPERTY_STRUCTURE,
} from './inventory/property-structure.controller.js';
import type { PropertyStructureService } from './inventory/property-structure.service.js';
import {
  PublicGalleryController,
  PUBLIC_GALLERY_SERVICE,
} from './marketplace/gallery.controller.js';
import type { PublicGalleryService } from './marketplace/gallery.service.js';
import {
  InventoryGrantReadController,
  INVENTORY_GRANT_READ_SERVICE,
} from './inventory/grants-read.controller.js';
import type { InventoryGrantReadService } from './inventory/grants-read.service.js';
import { GalleryController, GALLERY_SERVICE } from './inventory/gallery.controller.js';
import type { GalleryService } from './inventory/gallery.service.js';
import {
  ListingController,
  AmenityCatalogController,
  LISTING_SERVICE,
} from './inventory/listing.controller.js';
import type { ListingService } from './inventory/listing.service.js';
import {
  CustomerBookingDocumentController,
  BOOKING_DOCUMENT_SERVICE,
} from './booking/documents.customer.controller.js';
import { OwnerBookingDocumentController } from './booking/documents.owner.controller.js';
import type { BookingDocumentService } from './booking/documents.service.js';
import {
  BookingEvidenceController,
  BOOKING_EVIDENCE_SERVICE,
} from './booking/evidence.controller.js';
import type { BookingEvidenceService } from './booking/evidence.service.js';
import {
  InventoryBlockController,
  INVENTORY_BLOCK_SERVICE,
} from './inventory/blocks.controller.js';
import type { InventoryBlockService } from './inventory/blocks.service.js';
import { InboxController, INBOX_SERVICE } from './inbox/controller.js';
import type { InboxService } from './inbox/service.js';
import {
  InventoryGrantController,
  INVENTORY_GRANT_SERVICE,
} from './inventory/grants.controller.js';
import type { InventoryGrantService } from './inventory/grants.service.js';
import { FavoritesController, FAVORITES_SERVICE } from './marketplace/favorites.controller.js';
import type { FavoritesService } from './marketplace/favorites.service.js';
import { InstitutionController, INSTITUTION_SERVICE } from './marketplace/directory.controller.js';
import type { InstitutionService } from './marketplace/directory.service.js';
import { MarketplaceController, MARKETPLACE_SERVICE } from './marketplace/controller.js';
import { MarketplaceInventoryPagesController } from './marketplace/public-pages.controller.js';
import type { MarketplaceService } from './marketplace/service.js';
import { BookingPolicyReadController } from './inventory/policy-read.controller.js';
import { BookingPolicyController, BOOKING_POLICY_SERVICE } from './inventory/policy.controller.js';
import type { BookingPolicyService } from './inventory/policy.service.js';
import { BookingController, BOOKING_SERVICE } from './booking/controller.js';
import type { BookingService } from './booking/service.js';
import { BookingActionController, BOOKING_ACTION_SERVICE } from './booking/actions.controller.js';
import type { BookingActionService } from './booking/actions.service.js';
import { BookingUpfrontController, BOOKING_UPFRONT_SERVICE } from './booking/upfront.controller.js';
import type { BookingUpfrontService } from './booking/upfront.service.js';
import { INVENTORY_SERVICE } from './inventory/controller.js';
import { InventoryImportService } from './inventory/import.service.js';
import {
  InventoryImportController,
  INVENTORY_IMPORT_SERVICE,
} from './inventory/import.controller.js';
import type { InventoryService } from './inventory/service.js';
import {
  EmailAssociationController,
  EMAIL_ASSOCIATION_SERVICE,
} from './auth/http-email-association.js';
import type { EmailAssociationService } from './auth/email-association.service.js';
import { ProfileDetailsController, PROFILE_DETAILS_SERVICE } from './auth/http-profile-details.js';
import type { ProfileDetailsService } from './auth/profile-details.service.js';
import { InvitationController, INVITATION_SERVICE } from './management/invitation.controller.js';
import type { InvitationService } from './management/invitation.service.js';
import { HOSTEL_SETUP_SERVICE } from './management/hostel-setup.controller.js';
import type { HostelSetupService } from './management/hostel-setup.service.js';
import { hostelSetupControllers } from './management/hostel-branch-setup.controller.js';
import {
  ManagerAcceptanceController,
  MANAGER_ACCEPTANCE_SERVICE,
} from './auth/http-manager-acceptance.js';
import type { ManagerAcceptanceService } from './auth/manager-acceptance.service.js';
import { ManagementController, MANAGEMENT_SERVICE } from './management/controller.js';
import type { ManagementService } from './management/service.js';
import 'reflect-metadata';
import { FileController, FILE_SERVICE } from './files/controller.js';
import type { FileService } from './files/service.js';
import { IdempotencyInterceptor } from './idempotency/interceptor.js';
import type { IdempotencyService } from './idempotency/service.js';
import { limitAuthentication } from './auth/rate-limit.js';
import { Module, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { createApiDocument } from './documentation.js';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { ManagerController, MANAGER_SERVICE } from './auth/http-manager.js';
import type { ManagerService } from './auth/manager.service.js';
import { ProfileController, PROFILE_STORE } from './auth/http-profile.js';
import type { ProfileRepository } from './auth/profile.repository.js';
import { IdentityController, IDENTITY_SERVICE, OTP_SERVICE } from './auth/http-identity.js';
import type { IdentityService } from './auth/identity.service.js';
import { RegistrationController, REGISTRATION_SERVICE } from './auth/http-registration.js';
import {
  CustomerProfileController,
  CUSTOMER_PROFILE_SERVICE,
} from './auth/http-customer-profile.js';
import { OwnerProfileController, OWNER_PROFILE_SERVICE } from './auth/http-owner-profile.js';
import type { OwnerProfileService } from './auth/owner-profile.service.js';
import type { CustomerProfileService } from './auth/customer-profile.service.js';
import type { RegistrationService } from './auth/registration.service.js';
import type { OtpService } from './auth/otp.service.js';
import { SessionController, SESSION_SERVICE, AUTH_TRANSPORT } from './auth/http-session.js';
import type { SessionService } from './auth/session.service.js';
import type { AuthTransport } from './auth/transport.js';
import { DomainError } from '@hsm/contracts';
import type { ApiConfig } from './config.js';
import { AuthGuard, AuthorizationGuard } from './access.js';
import { assertRouteScopes } from './authorization/scope.js';
import type { ScopeStore } from './authorization/store.js';
import { HealthController } from './health.js';
import { INFRASTRUCTURE, rateKey, type Infrastructure } from './infrastructure.js';
import { logging, requestId } from './logging.js';
import { ProblemFilter } from './problem.js';
export async function createApplication(
  config: ApiConfig,
  infrastructure: Infrastructure,
  controllers: Type[] = [],
  authentication?: {
    sessions: SessionService;
    transport: AuthTransport;
    profiles?: Pick<ProfileRepository, 'read'>;
    identity?: IdentityService;
    otp?: OtpService;
    registration?: RegistrationService;
    customer?: CustomerProfileService;
    owner?: OwnerProfileService;
    profileDetails?: ProfileDetailsService;
    emailAssociation?: EmailAssociationService;
    managers?: ManagerService;
    managerAcceptance?: ManagerAcceptanceService;
    scopes?: ScopeStore;
  },
  foundation?: {
    idempotency?: IdempotencyService;
    files?: FileService;
    management?: ManagementService;
    hostelSetup?: HostelSetupService;
    invitations?: InvitationService;
    inbox?: InboxService;
    inventoryBlocks?: InventoryBlockService;
    inventory?: InventoryService;
    inventoryImports?: InventoryImportService;
    listingSettings?: ListingService;
    listingRules?: ListingRulesService;
    roomAmenities?: RoomAmenitiesService;
    roomLevelAmenities?: RoomLevelAmenitiesService;
    propertyStructure?: PropertyStructureService;
    gallery?: GalleryService;
    inventoryGrants?: InventoryGrantService;
    inventoryGrantRead?: InventoryGrantReadService;
    marketplace?: MarketplaceService;
    publicGallery?: PublicGalleryService;
    publicListingRules?: PublicListingRulesService;
    favorites?: FavoritesService;
    institutions?: InstitutionService;
    stays?: StayReadService;
    stayInvoices?: StayInvoiceService;
    stayReceipts?: StayReceiptService;
    stayPayments?: StayPaymentService;
    manualAdmissions?: StayManualAdmissionService;
    bookingCheckIns?: BookingCheckInService;
    occupancy?: OccupancyService;
    stayRecords?: StayRecordService;
    residents?: ResidentService;
    rentBoard?: RentBoardService;
    stayLifecycle?: StayLifecycleService;
    residentProofs?: ResidentProofService;
    ownStayNotices?: OwnStayNoticeService;
    billingPolicies?: BillingPolicyService;
    billingCatalog?: BillingCatalogService;
    bookingPolicies?: BookingPolicyService;
    bookingDocuments?: BookingDocumentService;
    bookingEvidence?: BookingEvidenceService;
    visits?: VisitService;
    waitlist?: WaitlistService;
    chat?: ChatService;
    bookings?: BookingService;
    bookingActions?: BookingActionService;
    bookingUpfront?: BookingUpfrontService;
  } & PhaseNineTenServices,
) {
  const applicationControllers = [
    HealthController,
    ...(foundation?.visits ? [VisitController] : []),
    ...(foundation?.waitlist ? [WaitlistController, WaitlistVacancyController] : []),
    ...(foundation?.chat
      ? [
          ChatController,
          BranchChatController,
          CustomerChatReportController,
          BranchChatReportController,
          ChatSafetyReportsController,
        ]
      : []),
    ...(foundation?.stays ? [StayReadController] : []),
    ...(foundation?.stayInvoices ? [StayInvoiceController] : []),
    ...(foundation?.stayReceipts ? [StayReceiptController] : []),
    ...(foundation?.stayPayments ? STAY_PAYMENT_CONTROLLERS : []),
    ...(foundation?.manualAdmissions ? [StayManualAdmissionController] : []),
    ...(foundation?.bookingCheckIns ? [BookingCheckInController] : []),
    ...(foundation?.occupancy ? [OccupancyController] : []),
    ...(foundation?.stayRecords ? [StayRecordController] : []),
    ...(foundation?.residents ? residentControllers : []),
    ...(foundation?.rentBoard ? [RentBoardController] : []),
    ...(foundation?.stayLifecycle ? [StayLifecycleController] : []),
    ...(foundation?.residentProofs ? [ResidentProofController] : []),
    ...phaseNineTenControllers(foundation),
    ...(foundation?.ownStayNotices ? [OwnStayNoticeController] : []),
    ...(foundation?.billingCatalog ? [BillingCatalogController] : []),
    ...(foundation?.billingPolicies ? [BillingPolicyController] : []),
    ...(foundation?.inventoryBlocks ? [InventoryBlockController] : []),
    ...(foundation?.inbox ? [InboxController] : []),
    ...(foundation?.inventoryGrants ? [InventoryGrantController] : []),
    ...(foundation?.inventoryGrantRead ? [InventoryGrantReadController] : []),
    ...(foundation?.listingSettings ? [ListingController, AmenityCatalogController] : []),
    ...(foundation?.listingRules ? [ListingRulesController] : []),
    ...(foundation?.roomAmenities ? [RoomAmenitiesController] : []),
    ...(foundation?.roomLevelAmenities ? [RoomLevelAmenitiesController] : []),
    ...(foundation?.propertyStructure ? [PropertyStructureController] : []),
    ...(foundation?.gallery ? [GalleryController] : []),
    ...(foundation?.favorites ? [FavoritesController] : []),
    ...(foundation?.institutions ? [InstitutionController] : []),
    ...(foundation?.marketplace
      ? [MarketplaceController, MarketplaceInventoryPagesController]
      : []),
    ...(foundation?.publicGallery ? [PublicGalleryController] : []),
    ...(foundation?.publicListingRules ? [PublicListingRulesController] : []),
    ...(foundation?.bookingPolicies ? [BookingPolicyController, BookingPolicyReadController] : []),
    ...(foundation?.bookings ? [BookingController] : []),
    ...(foundation?.bookingDocuments
      ? [CustomerBookingDocumentController, OwnerBookingDocumentController]
      : []),
    ...(foundation?.bookingEvidence ? [BookingEvidenceController] : []),
    ...(foundation?.bookingActions ? [BookingActionController] : []),
    ...(foundation?.bookingUpfront ? [BookingUpfrontController] : []),
    ...(foundation?.inventory ? inventoryControllers : []),
    ...(foundation?.inventoryImports ? [InventoryImportController] : []),
    ...(foundation?.invitations ? [InvitationController] : []),
    ...(foundation?.hostelSetup ? hostelSetupControllers : []),
    ...(foundation?.management ? [ManagementController] : []),
    ...(foundation?.files ? [FileController] : []),
    ...controllers,
    ...(authentication ? [SessionController] : []),
    ...(authentication?.identity ? [IdentityController] : []),
    ...(authentication?.registration ? [RegistrationController] : []),
    ...(authentication?.customer ? [CustomerProfileController] : []),
    ...(authentication?.owner ? [OwnerProfileController] : []),
    ...(authentication?.profileDetails ? [ProfileDetailsController] : []),
    ...(authentication?.emailAssociation ? [EmailAssociationController] : []),
    ...(authentication?.profiles ? [ProfileController] : []),
    ...(authentication?.managers ? [ManagerController] : []),
    ...(authentication?.managerAcceptance ? [ManagerAcceptanceController] : []),
  ];
  assertRouteScopes(applicationControllers);
  @Module({
    controllers: applicationControllers,
    providers: [
      { provide: INFRASTRUCTURE, useValue: infrastructure },
      { provide: VISIT_SERVICE, useValue: foundation?.visits },
      { provide: WAITLIST_SERVICE, useValue: foundation?.waitlist },
      { provide: CHAT_SERVICE, useValue: foundation?.chat },
      { provide: INVENTORY_BLOCK_SERVICE, useValue: foundation?.inventoryBlocks },
      { provide: INBOX_SERVICE, useValue: foundation?.inbox },
      { provide: INVENTORY_SERVICE, useValue: foundation?.inventory },
      { provide: INVENTORY_IMPORT_SERVICE, useValue: foundation?.inventoryImports },
      { provide: LISTING_SERVICE, useValue: foundation?.listingSettings },
      { provide: LISTING_RULES_SERVICE, useValue: foundation?.listingRules },
      { provide: ROOM_AMENITIES_SERVICE, useValue: foundation?.roomAmenities },
      { provide: ROOM_LEVEL_AMENITIES_SERVICE, useValue: foundation?.roomLevelAmenities },
      { provide: PROPERTY_STRUCTURE, useValue: foundation?.propertyStructure },
      { provide: GALLERY_SERVICE, useValue: foundation?.gallery },
      { provide: INVENTORY_GRANT_SERVICE, useValue: foundation?.inventoryGrants },
      { provide: INVENTORY_GRANT_READ_SERVICE, useValue: foundation?.inventoryGrantRead },
      { provide: MARKETPLACE_SERVICE, useValue: foundation?.marketplace },
      { provide: PUBLIC_GALLERY_SERVICE, useValue: foundation?.publicGallery },
      { provide: PUBLIC_LISTING_RULES_SERVICE, useValue: foundation?.publicListingRules },
      { provide: FAVORITES_SERVICE, useValue: foundation?.favorites },
      { provide: INSTITUTION_SERVICE, useValue: foundation?.institutions },
      { provide: STAY_READ_SERVICE, useValue: foundation?.stays },
      { provide: STAY_INVOICE_SERVICE, useValue: foundation?.stayInvoices },
      { provide: STAY_RECEIPT_SERVICE, useValue: foundation?.stayReceipts },
      { provide: STAY_PAYMENT_SERVICE, useValue: foundation?.stayPayments },
      { provide: STAY_MANUAL_ADMISSION_SERVICE, useValue: foundation?.manualAdmissions },
      { provide: BOOKING_CHECK_IN_SERVICE, useValue: foundation?.bookingCheckIns },
      { provide: OCCUPANCY_SERVICE, useValue: foundation?.occupancy },
      { provide: STAY_RECORD_SERVICE, useValue: foundation?.stayRecords },
      { provide: RESIDENT_SERVICE, useValue: foundation?.residents },
      { provide: RENT_BOARD_SERVICE, useValue: foundation?.rentBoard },
      { provide: STAY_LIFECYCLE_SERVICE, useValue: foundation?.stayLifecycle },
      { provide: RESIDENT_PROOF_SERVICE, useValue: foundation?.residentProofs },
      ...phaseNineTenProviders(foundation),
      { provide: OWN_STAY_NOTICE_SERVICE, useValue: foundation?.ownStayNotices },
      { provide: BILLING_CATALOG_SERVICE, useValue: foundation?.billingCatalog },
      { provide: BILLING_POLICY_SERVICE, useValue: foundation?.billingPolicies },
      { provide: BOOKING_POLICY_SERVICE, useValue: foundation?.bookingPolicies },
      { provide: BOOKING_DOCUMENT_SERVICE, useValue: foundation?.bookingDocuments },
      { provide: BOOKING_EVIDENCE_SERVICE, useValue: foundation?.bookingEvidence },
      { provide: BOOKING_SERVICE, useValue: foundation?.bookings },
      { provide: BOOKING_ACTION_SERVICE, useValue: foundation?.bookingActions },
      { provide: BOOKING_UPFRONT_SERVICE, useValue: foundation?.bookingUpfront },
      { provide: FILE_SERVICE, useValue: foundation?.files },
      { provide: MANAGEMENT_SERVICE, useValue: foundation?.management },
      { provide: HOSTEL_SETUP_SERVICE, useValue: foundation?.hostelSetup },
      { provide: INVITATION_SERVICE, useValue: foundation?.invitations },
      ...(authentication
        ? [
            { provide: SESSION_SERVICE, useValue: authentication.sessions },
            { provide: AUTH_TRANSPORT, useValue: authentication.transport },
            { provide: IDENTITY_SERVICE, useValue: authentication.identity },
            { provide: OTP_SERVICE, useValue: authentication.otp },
            { provide: REGISTRATION_SERVICE, useValue: authentication.registration },
            { provide: CUSTOMER_PROFILE_SERVICE, useValue: authentication.customer },
            { provide: OWNER_PROFILE_SERVICE, useValue: authentication.owner },
            { provide: PROFILE_DETAILS_SERVICE, useValue: authentication.profileDetails },
            { provide: EMAIL_ASSOCIATION_SERVICE, useValue: authentication.emailAssociation },
            { provide: PROFILE_STORE, useValue: authentication.profiles },
            { provide: MANAGER_SERVICE, useValue: authentication.managers },
            { provide: MANAGER_ACCEPTANCE_SERVICE, useValue: authentication.managerAcceptance },
          ]
        : []),
    ],
  })
  class ApplicationModule {
    async onApplicationShutdown() {
      try {
        foundation?.files?.close();
      } finally {
        await infrastructure.close();
      }
    }
  }
  const adapter = new FastifyAdapter({
    bodyLimit: config.BODY_LIMIT_BYTES,
    trustProxy: config.TRUST_PROXY,
    requestIdHeader: false,
    genReqId: requestId,
    logger: logging(config),
  });
  const app = await NestFactory.create<NestFastifyApplication>(ApplicationModule, adapter, {
    logger: false,
    abortOnError: false,
  });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ProblemFilter());
  app.useGlobalGuards(
    new AuthGuard(authentication),
    new AuthorizationGuard(authentication?.scopes),
  );
  app.useGlobalInterceptors(new IdempotencyInterceptor(foundation?.idempotency));
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { frameAncestors: ["'none'"] } },
  });
  await app.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || config.CORS_ORIGINS.includes(origin)) callback(null, true);
      else callback(new DomainError('FORBIDDEN', 403, 'Origin not permitted'), false);
    },
  });
  adapter.getInstance().addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    if (request.url.split('?')[0]?.startsWith('/v1/health/')) return;
    const window = Math.floor(Date.now() / 60000);
    let count: number;
    try {
      count = await infrastructure.increment(rateKey(request.ip, window), 60);
    } catch {
      throw new DomainError('INTERNAL', 503, 'Required dependency unavailable');
    }
    reply.headers({
      'RateLimit-Limit': config.GLOBAL_RATE_LIMIT,
      'RateLimit-Remaining': Math.max(0, config.GLOBAL_RATE_LIMIT - count),
      'RateLimit-Reset': (window + 1) * 60,
    });
    if (count > config.GLOBAL_RATE_LIMIT) {
      reply.header('Retry-After', 60);
      throw new DomainError('RATE_LIMITED', 429, 'Rate limit exceeded');
    }
  });
  installProfileCompatibility(adapter.getInstance());
  adapter.getInstance().addHook('preHandler', async (request, reply) => {
    await limitAuthentication(config, infrastructure, request, reply);
    await limitChat(config, infrastructure, request, reply);
  });
  if (config.APP_ENV === 'development' || config.APP_ENV === 'test') {
    const document = createApiDocument(app);
    SwaggerModule.setup('v1/docs', app, document);
  }
  app.enableShutdownHooks();
  await app.init();
  await adapter.getInstance().ready();
  return app;
}
