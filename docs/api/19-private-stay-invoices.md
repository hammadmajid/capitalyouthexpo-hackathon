# API 19: Private Stay invoice balances

Refs: CHG-009/012, RES-001, FIN-001, PAY-008/009, SEC-003, ACC-002/004. Source implementation2026-10-20; local/real runtime verification pending.

| Method | Path                                                     | Authority                                                 |
| ------ | -------------------------------------------------------- | --------------------------------------------------------- |
| GET    | /branches/{branchId}/stays/{stayId}/invoices/{invoiceId} | Owning Owner or active assigned Manager with finance_view |
| GET    | /me/stays/{stayId}/invoices/{invoiceId}                  | Live authenticated account with exact stays.userId link   |

All responses are private Cache-Control:no-store. Branch scope and live permission are rechecked in the repository; stay_manage alone does not grant financial access. Own reads use the explicit account/Stay link, without requiring a Customer profile or inferring identity from contact details. A foreign/unlinked Stay or a foreign invoice under an authorized Stay returns404. An unrelated staff branch returns403. Existing session/account revocation remains immediate.

The response is the strict residentInvoiceBalanceSchema: invoiceId, invoiceNumber, currency PKR, original dueDate, immutable agreed graceDays, totalPaisa, debitAdjustmentsPaisa, creditAdjustmentsPaisa, allocatedPaisa, outstandingPaisa and state. All amounts are integer paisa. States retain the original issued/partially_paid/paid/overdue/no_charge/voided projection. A zero balanced credit is not labeled Paid; Paid requires positive approved allocations. The repository reuses readResidentInvoiceBalance and its scoped receipt-backed allocation joins, original agreement grace and bounded server-side sums. An uploaded proof never becomes an approved allocation through these reads.

The server derives today in Asia/Karachi. The query object must be empty: client today, state, amounts, account overrides and includeDocuments are rejected. No CNIC, contact, private files, occupants, payment-proof URLs or internal actor metadata are returned. Historical Stay finances remain private readable records. This endpoint does not create, approve, reverse, transfer, refund or settle money.

Service producer validation rejects unexpected private fields and inconsistent Paid/balance output as opaque INTERNAL500. SDK readStaffStayInvoice/readCustomerStayInvoice preserve typed private GET routes, authentication and exact returned invoice identity; malformed or inaccessible results cannot become zero/Paid fallback data.

New real SQL/HTTP tests cover exact Owner/linked-account reads, Manager finance grant/revocation and branch isolation, foreign/unlinked object404, incomplete-payment rollback plus Paid only after actual matching receipt/ledger, and own reads without an unrelated Customer profile. These tests use actual approved-payment datasets solely to test reads; they do not satisfy admission or payment-route acceptance. All are NOT RUN LOCALLY until a compatible container environment executes them. Exact-source CI is NOT VERIFIED.

## Private receipt details (FIN-001 / PAY-008 / SEC-003)

Source implements GET /v1/branches/{branchId}/stays/{stayId}/receipts/{receiptId} and GET /v1/me/stays/{stayId}/receipts/{receiptId}. Staff require live owning Owner or active Manager with finance_view; own reads require the exact explicit Stay user link and do not require a Customer profile. Both are private/no-store, reject extra query fields, and use the same live actor/Stay authorization as invoice reads. Historical/terminal Stays remain readable.

The strict result is { receiptId, receiptNumber, issuedAt, snapshot, reversed }. The immutable snapshot contains the original resident/hostel/branch names, payment facts, exact invoice allocations and deposit/advance partition. It is validated against the actual same-scope approved payment. Current renamed records never rewrite the receipt. Reversed is derived from the original payment's recorded reversal, preserving all original receipt facts. Proof file IDs/locations, staff notes, CNIC and arbitrary source fields are excluded. This authorized private receipt deliberately contains its historical recipient name; public marketplace DTOs remain unchanged.

Service and SDK bind results to the exact requested receipt and Stay, plus branch for staff. Wrong-scope, malformed or private-extended producer results fail closed. No empty-success or balance fallback is permitted. A valid invoice response for a different requested invoice now also fails closed; the two regression assertions first reproduced RED2/14.

These reads introduce no payment approval, receipt mutation, PDF generation, account merge or money transfer. Contract, SDK, static and full API verification are pending; actual PostgreSQL receipt history/reversal/scope cases and HTTP authorization cases remain NOT RUN LOCALLY until a compatible container/CI run succeeds. See STATUS.md for current evidence.

## Invoice selection and connected balance views (2026-10-21)

FIN-001 / RES-001 / SEC-003: source adds GET
`/v1/branches/{branchId}/stays/{stayId}/invoices` and
`/v1/me/stays/{stayId}/invoices`. These use the same transaction-bound live
actor/session and staff finance_view or explicit own-Stay authorization as detail
reads. There is no contact-based identity inference or Customer-profile dependency.

The strict query is `{ limit?: 1..100, cursor?: UUID }`, default limit20. Records
are ordered by invoice ID with an exclusive cursor and limit+1 lookahead. The
strict result is `{ branchId, stayId, data, nextCursor }`; each row contains only
invoiceId, invoiceNumber, dueDate, issuedAt and documentState (issued/voided).
Nonterminal pages are full and nextCursor identifies the final returned record.
No amounts, payment status, resident identity or proof metadata appear in the
collection. Document state never implies Paid. Empty success differs from error.

The actual Web and Mobile Stay detail source mounts lazy named invoice selection
and calls the existing protected balance endpoint for a selected current-page
invoice. Staff entry requires the current parent's finance_view grant. Actor/Stay
changes reset selection; pending/failed authorization refresh hides cached private
facts. Display uses integer/bigint exact paisa formatting, including cents. It
shows original total, adjustments, receipt-backed allocations and outstanding
without calculating a new financial state in the client. It creates no payment.

Shared contract and SDK verification: LOCAL PASS898 contracts/52 files and655 SDK
checks/43 files; normal generation/build/check graph19/19 tasks passed. API/client
static and interaction verification remains pending. Five additional actual
PostgreSQL HTTP/scope/pagination cases are authored, NOT RUN LOCALLY. Existing
container test discovery includes them. CI and production readiness remain
unverified; source presence is not an acceptance claim. See STATUS.md for updates.

Connected-read local checkpoint: six API/Web/Mobile static tasks passed; all36 new
API assertions passed; actual Web and Mobile invoice selection/balance components
and mounted Stay entry points each passed11 new interaction assertions. All26
affected native assertions passed after explicit asynchronous authority fixture
synchronization. Whole-package coverage floors remain unchanged and selected
commands do not establish full package acceptance. The isolated unchanged Web
admission file passed4/4, but the latest full Web gate remains unresolved. Five
real PostgreSQL collection cases remain NOT RUN LOCALLY. Evidence and remaining
work are recorded in STATUS.md and phase3-functional-progress.md.
