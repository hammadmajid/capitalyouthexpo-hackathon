# HSM Transport continuation — CHG-042

## Current correction · CHG-044

Amenities & Services is the mobile route-creation entry point. Owner and Manager Operations keep real metrics, existing-route maintenance, rider names, requests and dedicated Transport invoices and collections. Staff general invoice selection excludes Transport-only invoices. The branch Billing Policy versions Transport due day, refundability and proration for new agreements. See [SRS v2.31](../srs/SRS-v2.31-transport-collections.md). This source change introduces no database migration. Disposable PostgreSQL verified one prorated charge, invoice availability before the due date, Due through that date, Overdue after it, receipt-backed Paid and Manager grant revocation. Focused contract, SDK, mobile and web tests passed.

Pixel 6 Pro verified Add route in Amenities & Services, entry into Transport Operations, real branch statistics and an empty rider queue. The Operations Routes tab showed the existing inactive draft and its edit action. Screenshots are stored locally under `.tools/hsm-transport-setup-chg044.png` and `.tools/hsm-transport-operations-chg044.png`. The local branch had zero subscribers, so populated billing states and payment recording were verified on disposable PostgreSQL.

CHG-043 supersedes the initial route-level subscription design. The corrected flow uses one branch offer and one subscription for a Stay. Route rows remain as schedules and the existing foreign key is retained for historical traceability. Migration 0075 preserves data and fails if existing duplicate live requests, overlapping windows, or conflicting active branch prices violate the final rule. The earlier verification below describes the continuation before this correction.

## CHG-043 rollout checks

- Review Stay IDs with more than one requested or active row, Stay IDs with overlapping approved date windows, and branches with more than one active separate price. Review existing charges and payments before resolving any conflict. These checks and any approved remediation must precede persistent migration.
- Deploy 0075 before serving the one-subscription code. The partial unique index protects concurrent requests, the date exclusion protects approved and ended windows, and the branch fee exclusion protects published prices. The billing engine also refuses overlapping windows. Capture in the agreed rent suppresses incremental Transport billing.
- Five real PostgreSQL API tests passed with 0075 in the migration chain. They cover concurrent requests targeting different routes, rejection of overlapping windows at the database, one prorated charge, included-in-rent treatment, loss of manager grants, route changes, and a cancellation/billing race. The corrected mobile coverage run passed 18 component tests. Four web component tests and 56 SDK tests passed. Focused lint passed with warnings.
- The full contract suite passed 1,137 tests and its coverage gate. The production web build and 57 focused API unit tests passed. The broad database unit run had 842 passes and four failures in baseline assertions for the place-type and file-purpose enums. The Transport change did not modify those enum definitions, their baseline migration or the failing test file.

### Rollout rehearsal and Android handoff — 2026-11-15

- The local `hsm` development database had 74 applied migrations with matching hashes. Migration 0074 and 0075 were pending. Read-only checks found zero duplicate live subscriptions, overlapping approved windows, or differing active branch fees.
- Restored a verified custom-format backup to disposable PostgreSQL 17, then applied 0074 and 0075 with the checked-in Drizzle runner. The journal reached 76 entries and all three Transport uniqueness/exclusion protections were present. Counts matched before and after for routes, subscriptions, charges, payments and invoices. The backup is stored under the ignored `.tools/transport-0075-049e49708a88/` directory. The disposable container was stopped after verification.
- Corrected the historical enum assertions to identify the migration that actually introduced the additional values. The full database unit suite now passes with its configured coverage gate.
- The physical Pixel 6 Pro opened HSM and displayed the signed-in Owner dashboard. Transport acceptance against the development API follows the approved local migration and API restart.

### Approved local rollout and Owner placement — 2026-11-16

This earlier Owner placement was superseded by CHG-044. Amenities & Services handles optional first-route setup. Once a route exists, Manage transport opens Owner Branch Operations for ongoing configuration and rider management.

The latest placement passed 23 focused mobile tests and the mobile TypeScript check. On Pixel 6 Pro, Manage transport opened Branch Operations for the correct branch and displayed the saved inactive draft, Riders, and Add route.

- Applied only migrations 0074 and 0075 after explicit approval. All 76 journal entries match. Verified the unique index and both exclusion constraints, and unchanged counts for resident subscriptions, charges, payments and invoices. The restarted local API reports ready.
- On Pixel 6 Pro, the Owner created and reopened `QA Transport 0075` on the local test branch. It persisted as an inactive route at 310,000 paisa. The local database has no linked operational resident Stay. The resident subscription and duplicate-charge scenarios retain disposable PostgreSQL evidence.
- Per the Owner navigation correction, the Transport workspace, including riders, is under Amenities & Services in the mobile setup wizard. Approved additional branches link directly to their own step. Managers continue to use their assigned branch tools.
- The updated mobile suite passed 26 tests. It checks that an old Owner Operations Transport link falls back to Bookings and that the setup step exposes the route and rider controls.
- Verified the changed layout on Pixel 6 Pro against the migrated local API. Amenities & Services opened as step 5, displayed the inactive test draft and route actions, and loaded the rider queue. The phone was returned to the Routes view within the wizard. Screenshot saved locally as `.tools/hsm-owner-setup-transport.png`.

## Recovered source

- `d63e8aa` contained migration 0074, typed destinations, stop roles, trip schedules and pricing contracts. `6eaf3ec` contained the branch routes API, projections, overview, generated SDK and integration specifications. The working tree contained partial Native setup, management and resident components. See the [initial recovery inventory](HSM_TRANSPORT_CONTINUATION_AUDIT.md).
- The pre-existing route/subscription entities, Places catalog, branch checks, Stay locks, audit writer and `syncTransportBilling` remain the implementation paths. The working tree had no completed cross-surface acceptance evidence. The unrelated Owner Hostel Rules change was excluded.

## Continuation implementation

- Amenities & Services reuses the branch editor within the existing wizard. New branches can skip Transport. Inactive route drafts are persisted and can be reopened. Explicit publication requires a stop or destination and a departure. Archived or incomplete routes stay private.
- Owner and Manager branch operations expose route, schedule and pricing forms. Manager actions use live branch inventory grants. The rider queue requires `finance_view`; decision commands separately require `stay_manage` and `rent_manage`. The overview conceals monthly amounts from staff without finance scope.
- Customer hostel details show published destinations, stops, schedules and explicit pricing. The accepted booking quote captures eligible included routes. The Stay's captured terms drive entitlement even if the route price later changes. Older and direct-admission agreements without a route capture acquire no entitlement automatically.
- Native and web resident flows show each route and subscription history, disclose the exact fee before a request, and support withdrawal and stop requests. Included services create no charge or subscription. Separately priced routes retain existing fee snapshots, billing synchronization and approval.
- The continued implementation uses migration 0074 as recovered. It adds no schema migration. The API and SDK add explicit route creation status, captured quote terms, and pagination on resident subscriptions. The overview redacts amounts when applicable. See [the API contract](../api/08-management-services-reports.md) and [SRS v2.30](../srs/SRS-v2.30-transport-operations.md).

## Verification and rollout

- Contracts: 1,137 passed with the configured coverage thresholds. SDK: 56 booking and resident-service tests passed, including preservation of route terms in hold and booking payloads.
- Disposable PostgreSQL: four Transport and billing tests passed, covering route publication, multiple trips and subscriptions, agreement capture, no duplicate charge and a cancellation/billing race. A separate manager test passed for live finance-grant revocation and denial of foreign-branch reads. The Transport tests use pre-scanned inventory fixtures. Upload-scanner suites retain their existing scanner fixture.
- Web: four service component tests passed. Focused lint reported zero errors. Its remaining warnings include existing function-length and complexity warnings.
- Existing bounds still apply to route lists (50). Direct-admission agreements without captured route terms have no included service. The operational forms do not offer a capture step for direct admissions.
- No persistent database migration was applied. The accepted deployment gate requires backup, preflight and explicit migration approval. Physical Android acceptance remains pending. No release readiness claim is made.
