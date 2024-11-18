# ADR 0057: Recorded external payment HTTP transaction

- Status: source implementation; real acceptance and production registration pending
- Date: 2026-10-20
- Refs: PAY-008/009, RENT-005, NTF-002, AUD-004, SEC-003, ACC-001/002/004; ADR0044/0056; Q14

## Decision

Compose the existing approved-payment component with live finance_view and payment_record grants, existing branch isolation, sorted identity participant locks and the existing actor-bound idempotency executor. Preflight discovers only the explicitly linked Stay account under live authorization. Release those preliminary locks; the financial transaction locks identities in the established global order before hierarchy/Stay. Recheck authority and the exact unchanged account link before execution and replay. Matching phone/email never creates or merges an account.

The authorized command validates every explicit invoice allocation under the Stay lock and commits approval, immutable receipt, ledger partition, hostel audit and linked-account notification together. Notification failure aborts the financial transaction. Offline residents retain a receipt without an invented login or notification recipient. A template event contains no payment amount, identity, proof content or unsafe link. HSM records an external hostel receipt; it never holds funds or asserts bank verification.

For an optional attachment on this direct staff-recorded command, accept only the current actor's own exact clean private payment_proof upload in the configured private bucket, with digest and verified object prefix. Record mandatory sensitive-access audit in the same transaction. There is no broad access to Customer uploads. Customer-submitted proof approval requires its own persisted submission/scope/review workflow; passing an arbitrary Customer file ID is rejected. This preserves Q14's proof-optional direct cash/payment path without expanding private-document access.

The controller accepts only the existing strict payment contract, UUID key and exact branch/Stay path. Cookie writes retain refresh-bound CSRF. Replays reload authority and validate the compact producer result, including exact command amount. Invalid producer data never becomes cached success. Original receipts remain immutable and can be read through the protected receipt routes.

The optional controller is enabled in acceptance fixtures only. Production main registration remains disabled until required real PostgreSQL/Redis/container and successful exact-source CI gates pass. No deployment, schema change, applied migration or changed financial/authorization rule is introduced.

## Verification

Unit/HTTP cases cover dual grants, actor revocation, account-link change, exact idempotency, proof ownership/scanning/private scope, CSRF, invalid money/private extras and mandatory notice failure. Real Testcontainers HTTP cases exercise concurrent keys/allocations, rollback/retry, Manager denial/revocation, private proof audit/reuse, exact partial/excess allocation and offline receipts. Real cases remain NOT RUN LOCALLY until actual compatible-environment execution. Current local evidence is maintained in STATUS.md.
