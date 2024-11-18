# API 07: Management Finance: Rent, Proofs, Deposits

Conventions: [`../07-api-contract.md`](../07-api-contract.md). Scope `BRANCH` unless marked. Rules: RENT-_, PAY-_, RB-_, FIN-_, COLL-*, ACC-004. All money is integer paisa. Every write is audited.

## Phase 3 implemented billing-policy routes (CHG-009)

CHG-047 extends `PUT /v1/branches/{branchId}/billing-policy/transport` with a `monthlySubscription` object for an unset or included offer. It contains `monthlyChargePaisa`, `dueDay`, `refundable` and `proration`. Separate billing continues to use the fee in `offer` and the billing rules alongside it. The current policy version and live branch grants are required. A prepared subscription becomes public when separate billing is selected.

The draft finance routes below remain the baseline roadmap. The first production
slice adds the following actual `/v1` routes; current runtime/CI verification is
reported separately in STATUS.md.

| Method | Route                                                                      | Scope and result                                                                       |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/v1/branches/{branchId}/billing-policy`                                   | Live branch scope; local and effective policy versions, `canEdit`                      |
| PUT    | `/v1/branches/{branchId}/billing-policy`                                   | Owner only, Idempotency-Key, CSRF for cookies; append complete explicit policy version |
| GET    | `/v1/branches/{branchId}/inventory/room-types/{roomTypeId}/billing-policy` | Live branch and exact non-archived child; local/effective versions                     |
| PUT    | `/v1/branches/{branchId}/inventory/room-types/{roomTypeId}/billing-policy` | Owner only, exact child, Idempotency-Key, CSRF; append local version                   |

PUT body is `{ policy }`, with required controlled cycle, proration, grace days,
late-charge policy, notice days, early-checkout treatment, open-end permission and
custom-charge mode from `billingPolicySchema`. No client creator/current-version,
account, balance or Paid flag is accepted. Query fields are rejected. Responses
are private/no-store; successful replay rechecks current Owner authority and binds
the actor, target and normalized policy. Supersession changes only `is_current` on
the old version, inserts the new version and writes mandatory hostel audit in one
transaction. It never edits existing stay agreements or issued financial records.

The authoritative PUT result, including a stored replay, must match the command's
exact local level, branch/room-type identifier and strict-normalized policy facts.
A malformed or mismatched producer response fails with opaque INTERNAL500 before
it can become a cached success. Invalid request scope/body/key remains a request
validation error; live authorization is rechecked before replay. SDK save helpers
also reject a valid response containing different submitted policy values.
The complete local API suite passes1,663 tests/164 suites with all configured gates, including23 response regressions. Actual PostgreSQL rollback acceptance remains NOT RUN LOCALLY; see STATUS.md. No new route,
pricing default or permission is introduced by these response checks.

Read selects at most four unique current scopes: platform, hostel, branch and the
exact room type. The most specific **complete** explicit policy wins; it does not
invent omitted financial defaults or merge incomplete financial objects. A missing
configuration is represented by null versions. Initial writes support branch and
room-type Owner scopes; platform/hostel writer UI and full finance flows remain in
progress. Managers may read their live assigned scope; they cannot write these
financial settings using a booking-policy grant. No new Manager permission is
implicitly granted.

Pure finance contracts preserve integer paisa conservation across invoice credit,
approved receipt-backed allocations, advance credit and separate deposit movements.
Zero/full-credit invoices are `no_charge`, never falsely Paid. These helpers do not
approve payment proof or assert bank settlement; scoped persistence must supply
authoritative posted totals joined to approved payments and immutable receipts.

### Explicit fee timing (CHG-011 / SRS v2.6)

The same Owner-only policy PUT additionally accepts optional feeBilling. Its
oneTimeDueOffsetDays is explicit; monthly, when supplied, contains a calendar-month
or anniversary-month cycle and full-period, calendar-day/rounding or manual-partial
proration. Read/replay return the exact versioned values. Missing configuration
is not filled from rent timing or another policy scope. Old policy JSON remains
valid; required fee planning fails closed until its explicit timing is provided.

Each planned fee must match the agreement's exact disclosed category/cadence and
base price. Monthly fees use their own monthly period even when rent is weekly;
one-time amounts cannot be overridden through the planner. Deterministic source
identity does not authorize a write. Internal human-only fee persistence shares
scoped Stay/agreement validation and charge/debit/invoice writes with rent, inside
the authorized caller transaction; audit/outbox remain mandatory caller work. Fee
HTTP/scheduling, actual admission and the complete financial workflows below remain
incomplete; calculation and zero charges create no payment/Paid state. See ADR0049 and STATUS.md for actual verification.

### Internal invoice projection checkpoint (FIN-001 / PAY-008)

The authored DB reader resolves the exact branch/Stay/invoice and sums posted
adjustments and net receipt-backed approved funding entries under a shared Stay
lock. It reuses the canonical issued/partial/paid/overdue/no-charge/voided projection.
Unspent deposit, uploaded proof and a waiver alone do not produce Paid. Opposite
reversal postings remove their previous allocation while preserving receipts.
Malformed/unsafe/inconsistent stored financial data produces an internal failure,
not a guessed zero. This component has no HTTP endpoint; live caller authorization,
server-derived Karachi today and final verification remain required. See STATUS.md.

## Rent Board

`GET /manage/branches/{branchId}/rent-board?month=2026-10&buildingId=&floorId=&status=`: BRANCH (RB-001..004)

```json
{ "month": "2026-10",
  "totals": { "expectedPaisa": 124000000, "collectedPaisa": 98000000, "outstandingPaisa": 26000000, "collectionRate": 0.79 },
  "floors": [ { "floor": "2", "rooms": [ { "roomNumber": "203", "seats": [
     { "seatId": "…", "label": "B1", "status": "paid",    "resident": { "stayId": "…", "fullName": "Ali" }, "invoiceId": "…", "outstandingPaisa": 0 },
     { "seatId": "…", "label": "B2", "status": "overdue", "resident": { … }, "invoiceId": "…", "outstandingPaisa": 1200000 },
     { "seatId": "…", "label": "B3", "status": "vacant",  "resident": null,  "invoiceId": null } ] } ] } ] }
```

- `status` ∈ `paid | pending | partial | overdue | due | vacant`, derived by the rule in schema §3.8. The client shows **label + icon + colour** (p.29 accessibility).
- A past `month` returns that month's historical state (p.29 month selector).

## Invoices

| Method | Path                                                                | Purpose                                                                                                                                                        | SRS                      |
| ------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| GET    | `/manage/branches/{branchId}/invoices?month=&status=&stayId=&kind=` | List                                                                                                                                                           | RENT-004                 |
| GET    | `/manage/branches/{branchId}/invoices/{invoiceId}`                  | Items, proofs, payments, receipt(s), history                                                                                                                   |                          |
| POST   | `/manage/branches/{branchId}/invoices/generate`                     | `{ month }`. Manually trigger generation for active residents (the job runs automatically too). Idempotent: existing invoices are skipped. **Idempotency-Key** | RENT-001, p.26 schedule  |
| POST   | `/manage/branches/{branchId}/invoices/{invoiceId}/adjustments`      | `{ amountPaisa (signed), reason }`. Explicit, never a silent rewrite                                                                                           | RENT-003, p.26 mid-cycle |
| POST   | `/manage/branches/{branchId}/invoices/{invoiceId}/late-fee`         | Manual late fee `{ amountPaisa, reason }` (when `late_fee_type = manual`)                                                                                      | FIN-002                  |
| POST   | `/manage/branches/{branchId}/invoice-items/{itemId}/void`           | `{ reason }`, e.g. revoke a late fee                                                                                                                           | FIN-002                  |
| POST   | `/manage/branches/{branchId}/invoices/{invoiceId}/void`             | `{ reason }`. **OWNER-ONLY**. Not allowed if approved payments exist                                                                                           | RENT-003                 |

## Payment proof approval (split-view queue, p.37)

| Method | Path                                                                | Purpose                                                                                                                      | SRS              |
| ------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| GET    | `/manage/branches/{branchId}/payment-proofs?status=pending&cursor=` | Queue, oldest first                                                                                                          | MGRD-003         |
| GET    | `/manage/branches/{branchId}/payment-proofs/{proofId}`              | Everything an approver needs (below)                                                                                         | PAY-007          |
| POST   | `/manage/branches/{branchId}/payment-proofs/{proofId}/approve`      | `{ note? }`. **Idempotency-Key**                                                                                             | PAY-006, PAY-008 |
| POST   | `/manage/branches/{branchId}/payment-proofs/{proofId}/reject`       | `{ code: not_received\|wrong_amount\|wrong_transaction\|unreadable\|duplicate\|other, note? }` (`note` required for `other`) | PAY-009          |

Proof detail response (PAY-007):

```json
{
  "id": "…",
  "status": "pending",
  "resident": { "fullName": "…", "stayId": "…" },
  "branch": "F-8",
  "room": "203",
  "seat": "B2",
  "invoice": {
    "id": "…",
    "invoiceNo": "INV-F8-000123",
    "month": "2026-10",
    "totalPaisa": 1200000,
    "outstandingPaisa": 1200000
  },
  "amountPaisa": 1000000,
  "amountMismatch": true,
  "method": "jazzcash",
  "transactionRef": "JC123…",
  "paidOn": "2026-10-04",
  "submittedAt": "…",
  "proofFile": { "url": "signed…", "expiresAt": "…" },
  "possibleDuplicateOf": null
}
```

**Approve** runs as one transaction (schema §3.8):

1. Payment created and invoice balance updated.
2. Advance goes to the credit ledger, and any deposit part updates the deposit record.
3. Receipt issued (PDF rendered async) and Rent Board state updated.
4. Notification queued and audit written.

Approving twice → the same payment and receipt are returned (p.28 idempotency). Partial amounts are allowed only if `partialPaymentsEnabled`; otherwise an under-payment → `422 PARTIAL_PAYMENT_DISABLED`, and the approver must reject with `wrong_amount`.

## Payments & receipts

| Method | Path                                                          | Purpose                                                                                                                                                                                                                             | SRS           |
| ------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| GET    | `/manage/branches/{branchId}/payments?month=&stayId=&method=` | Payment history                                                                                                                                                                                                                     | p.38 Payments |
| POST   | `/manage/branches/{branchId}/payments`                        | **Record a cash/direct payment** `{ invoiceId, amountPaisa, method, transactionRef?, paidOn, note }`. **Idempotency-Key**. Produces a receipt immediately (no proof needed). Approved by the recorder, audited. Allowed per **Q14** | ACC-004       |
| POST   | `/manage/branches/{branchId}/payments/{paymentId}/void`       | `{ reason }`. **OWNER-ONLY**. Reverses balances; the receipt is marked void, never deleted                                                                                                                                          | AUD           |
| GET    | `/manage/branches/{branchId}/receipts/{receiptId}`            | Receipt snapshot                                                                                                                                                                                                                    | p.30          |
| GET    | `/manage/branches/{branchId}/receipts/{receiptId}/pdf`        | Signed URL                                                                                                                                                                                                                          |               |

## Residents' money: ledger, deposits, discounts

| Method     | Path                                                        | Purpose                                                                                                                   | SRS                    |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| GET        | `/manage/branches/{branchId}/residents/{stayId}/statement`  | Invoices, payments, credit ledger, outstanding/advance                                                                    | RENT-004, p.26 advance |
| GET        | `/manage/branches/{branchId}/deposits?refundStatus=`        | All deposits in the branch                                                                                                | p.30                   |
| GET        | `/manage/branches/{branchId}/residents/{stayId}/deposit`    | Required, received, deductions, refund                                                                                    | p.30                   |
| GET / POST | `/manage/branches/{branchId}/residents/{stayId}/discounts`  | `{ kind: fixed\|percentage, value, effectiveFrom, effectiveTo?, reason }` (manager/owner approval = the creator; audited) | FIN-003                |
| POST       | `/manage/branches/{branchId}/discounts/{discountId}/revoke` | `{ reason }`                                                                                                              | FIN-003                |

## Reminders & collection

| Method | Path                                                    | Purpose                                                                                                                         | SRS                 |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| POST   | `/manage/branches/{branchId}/rent-reminders`            | `{ month, filter: overdue\|due\|unpaid, stayIds? }`. **Never sends to paid residents.** Returns `{ queued: n, skippedPaid: m }` | COLL-001, p.31      |
| GET    | `/manage/branches/{branchId}/rent-reminders?month=`     | Reminder history + delivery status (no false "delivered")                                                                       | p.31 reminder audit |
| GET    | `/manage/branches/{branchId}/collection-summary?month=` | Expected, collected, outstanding, rate                                                                                          | p.31                |
| GET    | `/owner/collection-summary?month=&branchId=all`         | OWNER: per-branch + combined                                                                                                    | RB-004, OWN-001     |
| GET    | `/owner/rent-board?month=`                              | OWNER: combined cross-branch summary (counts per status per branch; drill-down goes to the branch board)                        | RB-004              |

RB-002 / FIN-002 follow-on (CHG-013 / SRS v2.8 / ADR0051): invoice overdue classification requires explicit grace from the original immutable agreement linked through invoice charges, never a current policy default. Missing/conflicting original timing fails closed. Shared calculator tests pass 647/44; complete DB units pass 159/7 at 100% scoped coverage and static 8/8. Nine real invoice/grace PG scenarios remain NOT RUN LOCALLY. This introduces no financial HTTP route.

### Owner charge catalogue configuration (CHG-014 / SRS v2.9; implementation in progress)

GET/POST /v1/branches/{branchId}/charge-catalog and POST /v1/branches/{branchId}/charge-catalog/{catalogId}/archive are registered in the main application and offline OpenAPI generator and exposed by the shared SDK. The complete local API suite passes1,663/164, including catalogue service/HTTP cases; SDK and client evidence is tracked in STATUS.md. Seven real PostgreSQL/Redis HTTP scenarios remain NOT RUN LOCALLY; exact-source CI remains NOT VERIFIED. GET requires owning Owner or active Manager with finance_view and supports UUID cursor, limit20..100 and explicit includeArchived=true/false. Creation accepts only code, name, unitLabel and positive safe unitAmountPaisa; archive accepts only a required reason. Only Owner may write, with CSRF for cookie requests, Idempotency-Key, live authority rechecked on replay and mandatory transactional audit. No price edit, history deletion, financial posting or payment route is added. Every response is private/no-store, exact scoped and free of resident/document/creator identity. Archived entries retain unit-price history; the existing active-catalogue guard blocks new custom postings against them.

## Phase3 implementation checkpoint (2026-10-20)

API19 implements protected private invoice detail source with original immutable grace and receipt-backed balance projection; full current API validation is pending. ADR0056 describes the source-only approved external-payment transaction component. It retains human actors and exact receipt/ledger/audit completeness, with actual proof authorization and live operation grants still required in the future API. No payment mutation/approval/reversal route or notification producer is enabled by that component. Its35 local cases are not yet verified and10 PostgreSQL cases remain NOT RUN LOCALLY. Older endpoint planning above remains history; do not infer active payment routes.

## Guarded recorded-payment source (ADR0057)

POST /v1/branches/{branchId}/stays/{stayId}/payments is authored as an optional acceptance-fixture controller, absent from production main registration pending real financial gates. Body is the existing recordExternalPaymentInputSchema: amountPaisa, method, paidOn, required note, explicit allocations, depositPaisa, advanceCreditPaisa; optional transactionReference/proofFileId. UUID Idempotency-Key is required, extra query fields rejected, cookie CSRF mandatory,201 result private/no-store. Result is { paymentId, receiptId, receiptNumber, amountPaisa }; replay retains201 and sets Idempotency-Replayed.

Live finance_view AND payment_record are required for Managers; owning Owner follows existing scope rules. Replay rechecks current authority and unchanged explicit Stay account link. Optional direct staff attachment accepts only the actor's own clean private payment_proof upload with transactional sensitive audit. Customer-submitted proof approval is not implemented by this route. Required payment/receipt/ledger/audit/linked-account notice share one transaction; an offline resident creates no fake account/notice. Source-only tests are being verified; actual container cases remain NOT RUN LOCALLY and production registration remains disabled.

### Typed recorded-payment transport (2026-10-21)

The offline OpenAPI generator now includes the existing optional guarded payment
controller to generate its actual strict body/header/result types. This does not
register the controller in production main. SDK recordStayExternalPayment validates
branch/Stay UUIDs, the explicit distribution, a caller-owned UUID idempotency key,
and the returned receipt/payment result, including the exact submitted amount.
Cookie CSRF and bearer transport use the existing client. Network uncertainty is
returned to the caller; no automatic mutation retry or invented Paid state occurs.
The complete SDK gate passes655 tests/43 files with unchanged coverage thresholds;
shared contracts pass898/52. Source:.tools/phase3-invoice-reference-generation-sdk-resume-20261021.log.
This is transport verification, not payment-route or financial acceptance. Client
recording, real receipt-backed transaction verification and production activation
remain pending. No money flows through HSM.

### Payment recording client prerequisite (2026-10-21)

PAY-008 / FIN-001 / ACC-004: retained payment commands now freeze nested original
allocations, prevent concurrent or known-success resubmission, and preserve the
original key/body after network, malformed-result or server uncertainty. A later
rejection cannot unlock an already uncertain payment. A definite initial4xx may
be corrected deliberately. Each instance belongs to one actor/branch/Stay UI scope.
The draft schema reuses the existing bigint billingFormPaisa conversion, rejects
blank financial choices, validates explicit exact invoice/deposit/advance
partitions, and introduces no default allocation, float arithmetic or fund transfer.

Complete SDK LOCAL PASS698/45 with unchanged coverage gates; lint/typecheck/test/build
4/4 in3m26s. Evidence:.tools/phase3-payment-intent-sdk-retry-20261021.log. The initial
run passed all698 tests/build/typecheck but failed a test-call formatting lint rule;
the retry fixes that rule and reuses the existing money parser. No gate is weakened.
Web recording/confirmation/receipt source is authored and being connected; current
interaction/static verification is pending. Native recording is still pending.
The payment API remains an optional acceptance-fixture route, absent from production
main pending real acceptance. NOT RUN LOCALLY applies to real payment transactions;
CI remains unverified. This prerequisite leaves Phase3 at approximately27.7%,0/18
fully accepted workstreams.

### Connected staff recorded-payment clients (source checkpoint2026-10-21)

PAY-008 / FIN-001 / SEC-003 / ACC-004: Web and Mobile source connects the actual
named staff Stay detail to explicit external payment drafting, named paginated
invoice selection, exact allocation/deposit/advance amounts, review and explicit
receipt-of-money confirmation. Neither method nor financial allocation is silently
selected. Missing live finance_view or payment_record blocks the editor; the API
independently rechecks both grants, current actor and exact scope in the existing
transaction. The directory entry additionally requires its existing stay_manage
access; the future Rent Board must expose the authorized finance-only workflow.
This is an entry-point limitation, not a new backend grant requirement.

The command stays outside refreshing directory/detail renders. Uncertain outcomes
retain the original immutable command/key and disable editing/close. Known success
cannot be resubmitted. The existing private receipt reader must correlate payment
ID, receipt number and exact amount to that acknowledged result before display.
Historical names and allocations come from the actual receipt, never a client-made
receipt. Failed live authorization or receipt refresh hides old private facts.
No uploaded image, generic acknowledgement or balanced client draft marks rent Paid.

Static LOCAL PASS4/4 Web/Mobile lint/typecheck,2m59s. Initial Web diagnostic19/20
assertions passed; its revalidation assertion now explicitly waits for the rendered
error before checking hidden receipt data. The privacy assertions/deadlines remain.
Focused retry and native interactions are pending. Direct optional proof-upload
controls, receipt PDF/history, finance-only staff entry, real financial acceptance
and guarded production activation remain pending. Current progress stays27.7%.
The production main payment route remains disabled; no financial gate is bypassed.

Latest inspected CI39650006944 at20dc77c: all7 required jobs failed before execution
with0 steps; aggregate skipped. GitHub annotation confirms billing/spending block.
Evidence:.tools/phase3-payment-intent-ci-jobs-20261021.json and
.tools/phase3-payment-intent-ci-annotation-20261021.txt. No CI PASS is claimed.

Verified core-client checkpoint: static LOCAL PASS4/4, Web22/22 and native22/22 focused assertions, including9 new payment cases each. The selected commands retain whole-package coverage floors and exit1; no full package or real financial PASS is claimed. Web hook L/S/F100%, branches90.47%. Both actual staff Stay entries are mounted. Optional direct proof upload and remaining limits above are still pending. See STATUS.md and phase3-functional-progress.md for28.5% engineering progress and exact logs.

Direct staff proof client follow-on: Web/Mobile safe upload controls now accept existing payment_proof metadata, including private PDF. Explicit attachment requires clean readiness before review and deselection omits proofFileId from the actual command. The backend ownership/bucket/purpose/scan/SHA/path/audit checks are retained. Current local evidence: static4/4 plus final typecheck2/2, Mobile unit249/21 PASS, Web20 distinct assertions across runs and native33/33 assertions. Selected component commands retain full coverage floors and exit1. Actual uploads/scanner/payment transactions remain NOT RUN LOCALLY. Customer proof review, receipt PDF/history and production activation remain pending. Source progress28.9% is not acceptance; see STATUS.md.
