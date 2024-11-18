# ADR 0056: Approved external payment transaction component

- Status: source implementation; local component verification passed; real verification and complete payment workflow pending
- Date: 2026-10-20
- Refs: PAY-008/009, RENT-005, FIN-001, AUD-004, ACC-004; ADR0044

## Decision

Keep the existing strict approved-payment/distribution contracts and all original immutable financial SQL guards. The internal recordExternalResidentPayment component uses its caller's transaction, actual human actor and explicit server operation UUID. Reload hierarchy, Stay and resident under locks; source receipt party names from those records. A prior command source is a conflict inside this component; the API's existing idempotency executor owns authorized replay and must recheck current authority.

Validate every explicit invoice allocation against the exact scoped authoritative outstanding balance while holding the Stay write lock. Reject a voided invoice or excess allocation. Preserve exact partial credits, deposit liability and advance credit; never convert held funds into rent revenue. The approved amount and its allocation/deposit/advance partition must match every paisa. There is no implicit allocation-order or pricing change.

Insert the human approved external payment, immutable party/fact receipt snapshot, explicit source-linked credit entries and mandatory hostel audit in the same transaction. Any required write failure propagates to caller rollback. The receipt number derives from the server payment UUID. No source row or invoice Paid flag is mutated. Paid remains the existing receipt-backed aggregate projection. HSM does not move or hold money and never asserts bank verification from a proof.

A supplied proof requires the caller's real file authorizer inside this exact transaction before financial writes. No authorizer means fail closed with503; no default permissive validator exists. The future API must enforce private-bucket, purpose, clean scan and exact file access, with real tests. Callback-unit tests and rejection-only SQL cases do not prove that authorization integration.

The caller remains responsible for live finance_view plus payment_record authority, canonical identity/parent lock ordering, idempotency, eligible lifecycle/check-in requirements and required notification production. No route, application producer or deployment is enabled by this component. Full proof-authorized HTTP recording, receipt reads, corrections/reversals and real container/CI acceptance remain Phase3 work.

## Verification

Local component tests cover exact receipt/ledger partition, partial/deposit/advance cases, actor attribution, duplicate/scope/proof rejection and required failures. Actual PostgreSQL cases cover receipt-backed commit, concurrent allocations/duplicate commands, audit/ledger rollback, proof rejection, foreign invoices and separated held funds. These remain NOT RUN LOCALLY until executed in a compatible container environment. Do not infer a complete payment workflow from component coverage.

Local component checkpoint: normal DB static8/8 and full406/18 pass; all configured financial module coverage dimensions100%. This includes35 payment and34 receipt component cases. Ten payment/four receipt actual PostgreSQL cases remain NOT RUN LOCALLY. No financial mutation route or proof-ACL workflow is enabled.
