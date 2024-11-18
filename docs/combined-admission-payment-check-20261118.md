> Historical checkpoint. Gaps below are superseded by CHG-055 / SRS v2.36; see STATUS.

# Combined admission payment check — 2026-11-18

PAY-008 / BKG-007 / RENT-005 / SERV-002 / CHG-050. User asked whether a new resident
can pay security deposit, rent and applicable separate transport charges together.
This is verification, not a financial-policy change.

| Entry point                             | Current result                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Booking upfront, Deposit and first rent | Security deposit and rent are combined; separate transport is not added to that captured total.                                                    |
| Customer My Stay payment proof          | Rent and transport bills of the same Stay can share a proof and receipt. Explicit security-deposit allocation is missing.                          |
| General staff Record payment            | A single received amount can allocate security deposit and selected rent/transport bills; receipt distribution distinguishes deposit from advance. |
| Transport-only staff payment            | Deliberately restricted to the selected transport invoice; it cannot collect a deposit.                                                            |

## Evidence in source

- `upfrontAmountPaisa` in `packages/contracts/src/booking-upfront.ts` adds only
  monthly rent and deposit, according to the captured upfront requirement.
- `residentProofInputSchema` in `packages/contracts/src/resident-payment-proofs.ts`
  accepts selected invoice IDs and a total, but has no deposit allocation field.
- `ResidentProofRepository` approval passes `depositPaisa: 0` to the payment writer;
  money beyond outstanding selected bills becomes `advanceCreditPaisa`.
- `paymentCommand` in `apps/mobile/src/components/payment-plan.ts` reserves the
  staff-entered deposit and allocates the remaining amount across selected bills.
  The general staff form supports this; the invoice-specific transport form rejects it.

## Checks

LOCAL PASS: all 11 payment-planning unit tests, including a new exact combined case:
PKR 28,000 = security 10,000 + rent 15,000 + transport 3,000, with no advance credit.
LOCAL PASS: 3 real PostgreSQL/HTTP proof cases (including a combined receipt with
`depositPaisa: 0` and excess `advanceCreditPaisa: 500`) and 1 staff partial/deposit
receipt case. API/mobile lint and typecheck pass.
The initial full scanner-fixture attempt timed out during setup. Payment suites
already seed proof scan states; they now use the existing pre-scanned object-storage
fixture, retaining real PostgreSQL/HTTP, file checks and every assertion. No antivirus
acceptance is claimed by these payment tests.
No live resident payment or account setting was changed for verification.

## Remaining gap

Customer self-service submission/approval cannot yet treat security as part of an
all-in-one deposit/rent/transport proof. An extra transfer amount must not be described
as a security deposit: current approval records it as advance. A future implementation
must explicitly capture and validate the deposit component and preserve receipt, ledger,
refund and concurrent-payment invariants. No such behavior was introduced in this check.
