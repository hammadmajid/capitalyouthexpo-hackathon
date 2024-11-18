# ADR 0054: Atomic bounded billing delivery

- Status: accepted for source implementation; runtime/real infrastructure verification pending
- Date: 2026-10-20
- Refs: RENT-001/003/004, FIN-001/002, AUD-004, ACC-004, ADR0046/0048/0049

## Decision

Extend the existing internal outbox delivery path with resident.billing.period. The payload remains the existing strict scheduleId/version/periodIndex identity. Reload persisted scope and acquire hierarchy, Stay, schedule and outbox locks in that order. Recheck exact work identity, due time, pending status, token and fresh lease after locking. A stale/replaced/committed lease cannot post or acknowledge new records. Successful failed-message claims restore pending while retaining attempt/error history.

Use the same agreed rent/fee planners and canonical charge mapper as human commands. Current scheduled postings require an actually active/nonterminal Stay and the exact latest immutable agreement. Missing manual amounts pause at manual_required without inventing zero or full-period rent. Already obsolete work creates only its system completion proof and acknowledgement; inconsistent current work on a terminal or amended Stay fails closed until an explicit human schedule transition.

Within one transaction write required charge/debit/invoice/origin, immutable execution, mandatory system audit, exact schedule advancement, at most one subsequent internal job, and current lease acknowledgement. Any required failure rolls everything back. No human actor is borrowed. No payment, receipt or Paid flag is invented. Zero and finite exhaustion do not release occupancy or check out the resident.

Future recurrence wakes on its original calculated due date at 00:00 UTC, matching the existing UTC calendar arithmetic and instant storage. That is 05:00 Asia/Karachi; the configured calendar due date, amount, grace and period remain unchanged. Initial admission may issue its explicitly selected first period immediately. Never derive an automatic historical starting cursor from Stay creation; authorized admission selects the initial covered period explicitly. Process one period per transaction and persist only one next job, including bounded catch-up from that explicit cursor.

Register source delivery only when the complete command exists. Do not deploy or enable an application producer as part of this source-only continuation. Real PostgreSQL/Redis concurrency, lease replacement/expiry, audit/next-job rollback, restart recovery, replay/seed and exact-source CI remain required. Local unit coverage is not SQL or infrastructure acceptance.
