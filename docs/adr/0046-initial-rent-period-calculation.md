# ADR 0046: Initial rent periods use explicit agreement policy

- Status: shared planner verified locally; scheduling/admission runtime pending
- Date: 2026-10-18
- Refs: CHG-009, RENT-001/003/004, FIN-001/002, ADR0043

## Decision

Calculate one requested prospective rent period from the validated immutable
agreement and calendar Stay dates. Never materialize an unbounded schedule.
Calendar months retain the configured due day, clipped to the actual month end;
no hidden shift to the admission date or universal billing day is introduced.
Preview must expose a configured due date that precedes admission. Anniversary
months always anchor to the original admission day, including after February.
Weekly/fixed/term cycles use their explicit lengths and due offsets.

The agreement amount is for its selected cycle. Booking monthly prices must never
silently become weekly/fixed/term prices; booking admission must preserve monthly
basis or require an explicitly approved amendment. Fees/deposit remain separately
disclosed; this planner computes rent only and never creates a payment or Paid flag.

Full-period policy charges the agreed cycle amount. Calendar-day policy prorates
the actual billable days against the full cycle using explicit half-up/down/up
rounding in bigint paisa. Fixed-first-period policy applies the specified first
amount and the ordinary cycle amount thereafter. Manual partial-period pricing
remains unresolved until an explicit authorized amount is supplied; unused manual
overrides are rejected. Exact zero is a no-charge result, never a fabricated payment.
Early-checkout adjustments use their own selected policy and retained corrections.

## Consequences

Finite stays stop scheduling at their expected end; that does not check out actual
occupancy. Open-ended planning requires explicit agreed policy. Unsupported calendar
arithmetic or invalid money fails before writes. Real admission must atomically
persist the versioned agreement, schedule/required charges, assignment/claim, history,
audit and outbox, with source-key uniqueness and authorization-bound replay.
Calculation helpers alone do not implement or enable an admission route.

Shared planner promotion preserved all33 assertions and passed the complete570-test
contract checkpoint at100% line/statement/function/branch coverage. The subsequent
580-test/41-suite contract task also passes at100%. These are calculation/contract
results; no scheduled posting, worker, financial transaction or CI pass is implied.

## Persisted date adapter follow-on (2026-10-19)

A separate databaseDateSchema/databaseStayPeriodSchema validates PostgreSQL-backed
Stay/finance command and DTO dates without narrowing the pure planner input. The
original year0000 leap/calendar case remains in the unchanged rent suite. Seven
new boundary cases first reproduced invalid database-date acceptance, with seven
valid year0001 controls and617 other assertions passing. The scoped fix is applied;
the complete contract retry passes624 tests/43 suites at100% L/S/F/B, including
the database-date adapter, and static5/5. No financial amount or physical migration
changes; real infrastructure acceptance remains unverified.
