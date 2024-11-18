# ADR 0038: Ephemeral public viewing history

- Status: Implemented for review; verification pending
- Date: 2026-10-17
- Refs: CHG-007, ACC-002, SEC-003

## Context

The reference Home includes Recently Viewed. Native already retains at most 20
actual viewed public branch IDs in component memory. Web navigation unmounts Home
and its existing QueryClient defaults use gcTime zero. Fabricated cards, persistent
profiling and an unrelated second account/history store are outside this feature.

## Decision

Reuse the application's existing QueryClient for one bounded public ID list.
Record a canonical UUID only after a successful, completed public Details read.
Deduplicate, move the actual view to the front and retain at most 20 IDs. Only this
ID query uses infinite GC time, so it survives route changes for the lifetime of
the current in-memory client. Existing logout/account-change cache.clear removes
it immediately; useSyncExternalStore observes removal and has a stable empty server
snapshot. Reload/closing the app discards it. No localStorage/sessionStorage,
cookies, analytics, backend history or persisted retention changes are introduced.

Cards request current approved summaries through the existing ids-filtered public
marketplace API. Omit withdrawn/missing/unrequested IDs, sort returned actual rows
by genuine view order, and show loading, currently-unlisted and read errors apart.
A failed refresh hides cached cards. No IDs means no broad marketplace request.
Actual listing media uses the controlled public stream; failed/missing photos get
a truthful fallback. Generated static marketing art never fills listing photos.

## Consequences

Only public IDs survive route unmount; names, price and availability snapshots do
not become history records. Clearing the existing auth cache can discard history
also after other security/profile transitions; that is preferable to retaining a
previous identity's view state. No new business/default booking rule is introduced.
Twelve history/card cases and successful/failed Details recording assertions are
authored, not yet run. Complete web/native, real container, security and aggregate
acceptance remain mandatory; this ADR is not a package/phase PASS.
