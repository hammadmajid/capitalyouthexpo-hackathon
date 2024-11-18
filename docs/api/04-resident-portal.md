# API 04: Resident Portal: Active Hostel (`/me/stays/{stayId}`)

Conventions: [`../07-api-contract.md`](../07-api-contract.md). Scope `RESIDENT`: the stay must belong to the caller (`StayGuard`).

- **Upcoming** stays: read-only booking/arrival info. Rent, complaints etc. → `403 STAY_NOT_ACTIVE` (p.24 upcoming permissions).
- **Active / checkout_requested**: everything below.
- **Past** (`checked_out`): read-only history (invoices, receipts, payments, deposit, statement) + review. Pay Rent and new complaints → `403 STAY_NOT_ACTIVE` (STAY-004, CMP-006).

## Phase 3 implementation checkpoint (2026-10-19)

Private own-Stay collection/detail reads now have the explicit scoped contract in
[API17](17-stay-operational-reads.md). Its eight-state CHG-009 lifecycle and exact
Customer ownership apply to these reads. The historical endpoint plan below is not
a claim that rent, complaints, agreement acceptance, statements or mutations are
implemented; the general StayGuard remains deny-only for unimplemented resources.

## Overview

| Method | Path                                  | Purpose                                                                                         | SRS       |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| GET    | `/me/stays/{stayId}`                  | Branch, room & seat, check-in date, expected leave date, status, module flags (mess, transport) | STAY-002  |
| GET    | `/me/stays/{stayId}/agreement`        | Agreement version + acceptance status                                                           | p.25      |
| POST   | `/me/stays/{stayId}/agreement/accept` | Accept the current agreement version                                                            | p.25      |
| GET    | `/me/stays/{stayId}/notices`          | Branch notices                                                                                  | p.24 (D5) |

## Rent & payments

| Method | Path                                          | Purpose                                                                    | SRS                        |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| GET    | `/me/stays/{stayId}/invoices?status=`         | My invoices (month, total, paid, outstanding, status, due date)            | RENT-001..004              |
| GET    | `/me/stays/{stayId}/invoices/{invoiceId}`     | Invoice + items (rent, transport, discount, late fee…) + proofs + payments | p.30 discount transparency |
| GET    | `/me/stays/{stayId}/payment-methods`          | **Only this branch's** active payment accounts                             | PAY-002, PAY-003           |
| POST   | `/me/invoices/{invoiceId}/proofs`             | Submit payment proof. **Idempotency-Key**                                  | PAY-001..005               |
| GET    | `/me/stays/{stayId}/proofs`                   | My submitted proofs + status / rejection reason                            | PAY-009                    |
| GET    | `/me/stays/{stayId}/receipts`                 | Receipts list                                                              | p.30                       |
| GET    | `/me/stays/{stayId}/receipts/{receiptId}`     | Receipt data                                                               |                            |
| GET    | `/me/stays/{stayId}/receipts/{receiptId}/pdf` | Signed URL to the PDF (shareable with parents)                             | p.28 receipt               |
| GET    | `/me/stays/{stayId}/statement`                | Ledger: invoices, payments, advance credit, outstanding                    | RENT-004                   |
| GET    | `/me/stays/{stayId}/deposit`                  | Required, received, deductions, refund status                              | p.30                       |

`POST /me/invoices/{invoiceId}/proofs`:

```json
{
  "submissionToken": "uuid",
  "amountPaisa": 1200000,
  "method": "jazzcash",
  "transactionRef": "JC123456789",
  "paidOn": "2026-10-04",
  "fileId": "…"
}
```

- The invoice must belong to the caller's active stay (or their `payment_pending` booking) and be unpaid → else `404` / `409 INVOICE_ALREADY_PAID`.
- `amountPaisa` > 0. If it differs from the outstanding amount it is accepted and flagged for the approver (p.28 amount mismatch). Overpayment is allowed only when the branch allows advance payments.
- The file must be the caller's `payment_proof` upload with `scanStatus = clean`.
- Response `201`: proof in `pending` + timestamp. The invoice shows **Pending Verification**. Rent is **never** marked paid at this point (p.27 no false paid state).
- A repeated `submissionToken` returns the same proof (p.27 duplicate submit).

## Mess & transport

| Method | Path                                                     | Purpose                                                  | SRS                   |
| ------ | -------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| GET    | `/me/stays/{stayId}/menu`                                | Current weekly menu (read-only for residents)            | SERV-001              |
| GET    | `/me/stays/{stayId}/transport/routes`                    | Routes, stops, timings, monthly charge                   | SERV-002              |
| GET    | `/me/stays/{stayId}/transport/subscription`              | My subscription status                                   |                       |
| POST   | `/me/stays/{stayId}/transport/subscriptions`             | `{ routeId }` opt-in request                             | p.32                  |
| POST   | `/me/stays/{stayId}/transport/subscriptions/{id}/cancel` | Opt-out request (an effective date is set by management) | p.32 charge lifecycle |

## Complaints

| Method | Path                                                 | Purpose                                                                       | SRS          |
| ------ | ---------------------------------------------------- | ----------------------------------------------------------------------------- | ------------ |
| GET    | `/me/stays/{stayId}/complaints`                      | My complaints                                                                 | CMP-001      |
| POST   | `/me/stays/{stayId}/complaints`                      | `{ category, title, description, attachmentFileIds? }`; room/seat auto-linked | CMP-001..003 |
| GET    | `/me/stays/{stayId}/complaints/{complaintId}`        | Detail + status history                                                       | p.33         |
| POST   | `/me/stays/{stayId}/complaints/{complaintId}/accept` | Accept the resolution → `closed`                                              | CMP-004      |
| POST   | `/me/stays/{stayId}/complaints/{complaintId}/reopen` | `{ note }` → `reopened`                                                       | CMP-004      |

## Checkout

| Method | Path                                         | Purpose                                                                                                   | SRS                           |
| ------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------- |
| POST   | `/me/stays/{stayId}/checkout-request`        | `{ requestedCheckoutDate, isEmergency, reason? }`. Response shows the notice period vs the requested date | OUT-001/002, p.34 notice calc |
| POST   | `/me/stays/{stayId}/checkout-request/cancel` | Cancel before management starts settlement                                                                |                               |
| GET    | `/me/stays/{stayId}/checkout`                | Checkout status + final statement once finalised                                                          | OUT-005                       |

Submitting notice does **not** free the seat. Only management's checkout completion does (p.34).

## Review

| Method | Path                                    | Purpose                                                                                                  | SRS              |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------- |
| GET    | `/me/stays/{stayId}/review-eligibility` | `{ eligible, eligibleFrom, reason }` (≥ 30 days of stay, one per stay)                                   | REV-001..003     |
| POST   | `/me/stays/{stayId}/review`             | `{ ratings: { cleanliness, security, food, staff, wifi, facilities, location, value, overall }, body? }` | REV-004          |
| PATCH  | `/me/stays/{stayId}/review`             | Edit (history kept)                                                                                      | p.35 edit policy |

Works for active **and** past stays (REV-002: eligibility remains after checkout).

### Phase3 notice component checkpoint (OUT-001/002/006)

ADR0060 defines a strict internal notice transaction with server Karachi submission date, current effective original agreement, expected Stay version, exact self linkage, mandatory live authorization/history/audit and linked delivery. Short or emergency notice retains its actual shortfall; no fee is inferred and actual occupancy/claim remains. No notice HTTP endpoint, cancel endpoint, client workflow or checkout is enabled by this source. New local and seven actual PostgreSQL cases are authored, NOT YET VERIFIED / NOT RUN LOCALLY. Current evidence stays in STATUS.md; draft endpoint tables above do not claim implementation.

### Guarded own-Stay notice HTTP source (2026-10-21; ADR0066)

Optional acceptance-fixture source defines POST /v1/me/stays/{stayId}/checkout-request with Idempotency-Key and strict existing stayNoticeInputSchema: expectedVersion, requestedCheckoutDate, isEmergency and optional reason (required for emergency). Request/query fields cannot confer actor, branch, financial settlement or inventory-release authority. The route requires current authentication and cookie CSRF where applicable; repository authorization proves exact account linkage and active hierarchy before the protected Stay lock. A separate Customer profile is not inferred or required for a linked resident identity.

Strict201 returns noticeId, stayId, notice_given, next version and the original notice plan (submitted/requested/earliest compliant dates, required/provided/shortfall days, emergency flag and policy version). Calendar fields must agree. Successful replay rechecks current own authority and returns the original operation result. State/version/history/audit and mandatory linked notification belong in one transaction; no assignment/claim is released and no fee/payment is inferred. Production main does not register this service. Source/unit/HTTP cases are authored, NOT YET VERIFIED; new real PostgreSQL acceptance and client workflow remain required. Existing Testcontainers suites remain NOT RUN LOCALLY; exact-source CI NOT VERIFIED.

### Connected notice submission clients (2026-10-21; activation still guarded)

The earlier client-not-started checkpoint is superseded for submission only.
Actual Web and Android My stays mount the form from an active checked-in own Stay,
with no raw Stay identifier entry. Shared RetainedOwnStayNotice retains the original
normalized body and Idempotency-Key through uncertain results and current-link
revalidation. Both clients use current cookie/CSRF or bound bearer transport;
actor/scope changes purge private drafts, and denied reads hide server timing.
Recorded timing is acknowledgement only: no checkout, inventory release, fees or
payment success is inferred. Production main still excludes ownStayNotices pending
real transactional acceptance. Persisted notice details/history, cancellation and
staff handling remain separate unfinished work. See STATUS.md for exact local
assertion evidence, the failed complete Web gate and pending native/CI acceptance.

## Settlement completeness correction (2026-10-27; AUD-001)

OUT-003..006 / FIN-002/004: settlement payable/refundable totals cover every
authoritative invoice in the authorized Stay, independently of the existing
200-invoice response-detail bound. Fund-source detail retains its 100 eligible
source bound; spent newer payments do not hide an older held source. Checkout
deposit application traverses all scoped invoices and funding sources through the
canonical balance/movement commands in the checkout transaction. If completion
would exceed the existing 400-movement result contract, return a conflict and roll
back the entire checkout; staff can first record authorized applications and retry.
Original invoices and frozen historical statements are never rewritten.

The bounded checkout DTO alone has a 256 KiB idempotent-response cache budget
(ADR0074); other commands retain 64 KiB. The 24-hour replay lifetime, current
authority checks and private-field/signed-URL rejection remain unchanged.
