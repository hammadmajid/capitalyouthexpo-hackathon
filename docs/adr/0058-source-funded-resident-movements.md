# ADR 0058: Original-payment-funded resident movements

- Status: source implementation; verification and application workflow pending
- Date: 2026-10-20
- Refs: RENT-005, PAY-008, FIN-001, OUT-004/005, AUD-004, ACC-001/004; ADR0044

## Decision

Use the existing five controlled fund movement kinds and immutable source guards. A strict internal command identifies the exact original approved payment and human actor. Lock hierarchy/Stay/resident/payment, reject foreign/reversed payment or a duplicate source, and aggregate receipt-backed held funds restricted to that payment. Another payment's deposit/advance never covers an overspend.

Applications require the exact scoped non-void invoice and cannot exceed current outstanding. Append a fund debit and equal receivable credit with original funding provenance. Deduction/externally recorded refund appends only its separate fund debit; it never becomes rent revenue or HSM money movement. Required source/ledger/audit writes share the caller transaction. Any failure aborts it. Original receipt/payment/invoice remains immutable. No implicit allocation order, automatic deduction, bank verification or silent correction is introduced.

The caller remains responsible for live finance_view and explicit authorized fund-operation scope, exact object checks, canonical identity locks, authorized idempotency and mandatory notifications. Components are not publicly exported or registered as HTTP/application producers yet. Production registration requires successful real transaction/CI gates; schema guards and unit coverage alone do not satisfy acceptance.

## Verification

Local tests cover each controlled movement, source-specific capacity, canonical source identity, malformed/foreign/reversed/duplicate sources, invoice caps, exact ledger partition and mandatory failures. Actual PostgreSQL cases cover all five actions, concurrent overspend/duplicates, foreign/reversed funding and audit rollback/retry. All actual container cases remain NOT RUN LOCALLY until executed in a compatible container environment. STATUS.md records actual completed local evidence separately.
