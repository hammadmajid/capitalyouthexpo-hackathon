# Architecture Decision Records

One file per significant technical decision, numbered in order. Never edit an accepted ADR's decision. Write a new ADR that supersedes it.

**Format:** Status · Date · Context · Decision · Consequences (see `0001`).

| #                                                   | Title                                                      | Status   |
| --------------------------------------------------- | ---------------------------------------------------------- | -------- |
| [0001](0001-technology-stack.md)                    | Technology stack                                           | Accepted |
| [0002](0002-email-delivery-and-otp.md)              | Email delivery (Hostinger SMTP) & email-only OTP           | Accepted |
| [0003](0003-money-transport-boundary.md)            | Exact bigint domain money with safe integer JSON transport | Accepted |
| [0004](0004-container-verification-in-ci.md)        | Authoritative container verification in GitHub Actions     | Accepted |
| [0005](0005-development-s3-provider.md)             | Development S3 provider after MinIO pull failure           | Accepted |
| [0006](0006-client-capability-parity.md)            | Shared client capability parity                            | Accepted |
| [0007](0007-durable-email-delivery.md)              | Durable email delivery and worker keys                     | Accepted |
| [0008](0008-phase-1-rls-deferral.md)                | Phase 1 RLS deferral after isolated spike                  | Accepted |
| [0009](0009-private-file-quarantine.md)             | Private quarantine and verified snapshots                  | Accepted |
| [0010](0010-transactional-file-scan-publication.md) | Transactional scan publication                             | Accepted |
| [0011](0011-private-file-http-transactions.md)      | Private file HTTP transactions                             | Accepted |
| [0012](0012-in-app-notification-publication.md)     | In-app notification publication                            | Accepted |
| [0013](0013-staff-revocation-transactions.md)       | Staff revocation transactions                              | Accepted |
| [0014](0014-shared-client-generation.md)            | Shared client generated from offline API metadata          | Accepted |
| [0015](0015-same-origin-web-authentication.md)      | Same-origin web authentication                             | Accepted |
| [0016](0016-mobile-secure-session-foundation.md)    | Mobile secure session foundation                           | Accepted |
| [0017](0017-temporary-dependency-backports.md)      | Temporary dependency backports                             | Accepted |
| [0018](0018-private-api-observability.md)           | Private API observability                                  | Accepted |

| [0019](0019-telemetry-envelope-privacy.md) | Telemetry envelope privacy | Accepted |

| [0024](0024-aggregate-coverage-evidence.md) | Complete, revision-bound aggregate coverage evidence | Accepted; implementation in progress |

| [0029](0029-confirmation-participant-locks.md) | Ordered identity participants for booking confirmation | Accepted; verification pending |

| [0030](0030-booking-lifecycle-outbox.md) | Booking lifecycle handoff through the existing outbox | Accepted; verification pending |

| [0031](0031-phase-two-business-coverage.md) | Combined Phase 2 server business coverage | Accepted; verification pending |

| [0032](0032-listing-settings-preconditions.md) | Scoped listing settings and explicit publication preconditions | Accepted; verification pending |

- [0033: Controlled listing gallery publication](0033-controlled-listing-gallery.md)

- [0039: Scoped informational hostel rules](0039-informational-hostel-rules.md) — implementation and verification in progress.

## Additional recorded decisions

- [0020: Revised Phase 1 identity and onboarding acceptance](0020-revised-phase-one-identity-onboarding.md) — Accepted.
- [0021: Main-branch drafts use existing branch verification states](0021-main-branch-drafts.md) — Accepted.
- [0022: Manager invitations preserve identity consent and one-time issuance](0022-manager-invitation-issuance.md) — Accepted.
- [0023: A separate gate verifies actual application containers](0023-application-container-gate.md) — Accepted.
- [0025: Verified email on the existing phone-only Manager identity](0025-phone-only-manager-email-association.md) — Accepted.
- [0026: Branch pin selection with MapLibre and OpenFreeMap](0026-branch-map-picker.md) — Accepted; verification in progress.
- [0027: Configurable Phase 2 inventory and booking](0027-configurable-phase-two-inventory-booking.md) — Accepted.
- [0028: Owner-only pre-confirmation booking-document access](0028-owner-pre-confirmation-document-access.md) — Accepted.
- [0034: Enforce the existing media publication restriction](0034-gallery-publication-capability.md) — Accepted; full verification pending.
- [0035: Bounded public gallery continuation](0035-bounded-public-gallery.md) — Accepted; real infrastructure verification pending.
- [0036: Independent room-type amenity commands](0036-room-type-amenity-commands.md) — Implementation in progress; verification pending.
- [0037: Retain original publication authority on gallery replay](0037-gallery-replay-publication-provenance.md) — Repair implemented; focused regression passed; full acceptance pending.
- [0038: Ephemeral public viewing history](0038-ephemeral-public-viewing-history.md) — Implemented for review; verification pending.

- [0040: Coherent bounded public discovery aggregates](0040-coherent-discovery-aggregates.md) — implementation in progress; verification pending.

- [0041: Scoped management inventory pages](0041-scoped-management-inventory-pages.md) — Implementation in progress; verification pending.

- [0042: Bounded public inventory options](0042-bounded-public-inventory-options.md) — See ADR and STATUS.md for implementation and verification scope; final acceptance pending.

- [0043: Resident, Stay and finance foundations](0043-resident-stay-finance-foundation.md) — See ADR and STATUS.md for implementation and verification scope; final acceptance pending.

- [0044: Source-linked resident ledger and payment conservation](0044-source-linked-resident-ledger.md) — See ADR and STATUS.md for implementation and verification scope; final acceptance pending.

- [0045: Stay inventory claim lineage](0045-stay-inventory-claim-lineage.md) — See ADR and STATUS.md for implementation and verification scope; final acceptance pending.

- [0046: Canonical rent periods and separate persisted date validation](0046-initial-rent-period-calculation.md) — See ADR and STATUS.md for implementation and verification scope; final acceptance pending.

- [0047: Canonical agreed-rent transaction component](0047-canonical-agreed-rent-posting.md) — See ADR and STATUS.md for implementation and verification scope; final acceptance pending.

- [0048: Scheduled billing system provenance (design only)](0048-scheduled-billing-provenance.md) — See ADR and STATUS.md for implementation and verification scope; final acceptance pending.

- [0049: Explicit disclosed-fee cadence and internal persistence](0049-explicit-disclosed-fee-cadence.md) — See ADR and STATUS.md for implementation and verification scope; final acceptance pending.

- [0050: Linked Stay self-read capability](0050-linked-stay-self-read-capability.md) — Authorization clarification recorded; RED/controller fix and final acceptance pending.

- [0051: Immutable invoice grace classification](0051-immutable-invoice-grace-classification.md) — RED reproduced; implementation and acceptance pending.

- [0052: Owner-controlled immutable charge catalogue configuration](0052-owner-charge-catalog-configuration.md)

- [0053: Shared financial settings form](0053-shared-financial-settings-form.md) — See STATUS.md for complete local validation; infrastructure acceptance pending.

- [0054: Atomic bounded billing delivery](0054-atomic-billing-delivery.md) — Source implementation; real PostgreSQL/Redis and CI acceptance pending.

- [0055: Explicit initial billing transaction](0055-explicit-initial-billing-transaction.md) — Source implementation; complete admission and acceptance pending.

- [0056: Approved external payment transaction component](0056-approved-external-payment-transaction.md) — Source implementation; payment API/proof/notification integration and acceptance pending.

- [0057: Recorded external payment HTTP workflow](0057-recorded-payment-http-workflow.md) — Source implementation; production registration and real acceptance pending.

- [0058: Original-payment-funded resident movements](0058-source-funded-resident-movements.md) — Internal source implementation; real/application acceptance pending.

- [0059: Owner payment reversal component](0059-owner-payment-reversal-component.md) — Source implementation; local/real and HTTP verification pending.

- [0060: Original agreed notice timing](0060-agreed-notice-timing.md)

- [0061: Operational admission target locks](0061-operational-admission-target.md)

- [0062: Explicit admission resident relationship](0062-explicit-admission-resident-relationship.md)

- [0063: Current admission conflicts and agreement binding](0063-current-admission-conflicts-and-agreement.md)

- [0064: Atomic manual admission and recipient-free delivery](0064-atomic-manual-admission-and-delivery.md)

- [0067: Source-validated chat and immediate authority revocation](0067-chat-realtime-and-authority-revocation.md)

- [0068: Scoped CSV validation and immutable inventory import history](0068-inventory-csv-import-history.md)
- [0069: Effective room-type prices and retained financial snapshots](0069-effective-room-type-price-history.md)
- [0070: Mandatory room and bed photos for public selectability](0070-room-and-bed-photo-publication.md)
- [0071: Booking upfront payment verification without new booking states](0071-booking-upfront-verification.md)
