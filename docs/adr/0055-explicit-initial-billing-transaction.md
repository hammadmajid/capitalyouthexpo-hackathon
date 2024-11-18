# ADR 0055: Explicit initial billing transaction

- Status: source implementation; local and real infrastructure acceptance pending
- Date: 2026-10-20
- Refs: STAY-001, RENT-003/004, FIN-004, AUD-004, ACC-004; ADR0046/0048/0049/0054

## Decision

Admission must supply the real human actor and explicitly selected starting period for rent and every disclosed fee. Validate the complete exact item/cadence set before any initial financial write. Never derive historical arrears from an existing resident's move-in date, omit a disclosed fee, duplicate a cadence or accept caller-supplied calculated financial totals.

The internal initializeAdmissionBilling component reuses human agreed-rent/fee transaction commands for initial posting, including explicit manual proration amounts and exact zero. After each initial posting, authorize the immediately following period in the same transaction, with dispatch explicitly on its original calculated due date at00:00UTC (ADR0054), never immediately merely because admission is occurring. Authorization requires an explicit immediate/on_due_date internal mode; no timing default is inferred. A no_period result retains its explicit exhausted cursor. Manual amounts belong only to the selected human posting; they never become a recurring price override. The existing immutable agreement still contains agreed rent, deposit and disclosed fees. No deposit payment or receipt is invented.

The internal authorizeResidentBilling component records an exact human authorization audit before persisting one pending internal job and its version-one scoped schedule. Unresolved manual/exhausted next selections create no job. The actual authorizer stays separate from agreement creator and future system executor. Caller must hold live branch/human authorization and parent locks; this component does not grant a Manager any permission.

Both components use the caller's transaction. A required initial charge, invoice, ledger, schedule audit, job or schedule failure must abort admission. No component opens a separate transaction or reports a complete Stay. The future admission orchestrator remains responsible for identity, consent, KYC, operational inventory, actual occupancy, complete financial/check-in requirements, admission audit and notifications.

## Verification

Retain all canonical rent/fee tests. Add local orchestration and authorization cases plus actual PostgreSQL component/rollback cases. These tests do not replace real admission HTTP, concurrency, branch-isolation, payment, Redis or exact-source CI acceptance. No producer/route/deployment is enabled by this ADR.
