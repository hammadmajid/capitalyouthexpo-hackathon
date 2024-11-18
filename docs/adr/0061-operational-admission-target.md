# ADR 0061: Operational admission target locks

- Status: source implementation; normal verification and complete admission pending
- Date: 2026-10-20
- Refs: STAY-001, RES-004, ACC-001/002/004; CHG-009; ADR0045

## Decision

Actual admission targets use private operational inventory rules. Caller first proves current admission authority, sorted identity locks and active branch hierarchy. Public verification/listing visibility is not an admission authorization substitute and is not required merely to operate a private hostel. The Phase2 public inventory/quote helper remains unchanged.

Lock and validate exact branch-bound room, room type and requested bed in canonical order. Keep existing per-bed/whole-room/both mode rules, active/archive state and physical ordinal/capacity binding. A whole-room target retains null bed identity and checks at most one unavailable live bed, under the room lock also used by bed lifecycle commands. No unbounded bed directory, public identity or price data is returned.

This internal helper does not authorize a caller, check reservation availability, reserve inventory or complete admission. The composing transaction must expire reservations and commit resident/Stay/agreement, canonical assignment/claim, required initial billing, history/audit and outbox together. Existing actual occupancy/exclusion constraints remain authoritative. No export, route or production admission is enabled by this component.

## Verification

Thirty-three unit boundary cases and ten actual PostgreSQL cases are authored. Real cases cover private unapproved listing, exact bed/whole-room identity, configured modes, maintenance, foreign object binding and deterministic NOWAIT room-lock contention/release. They are target-lock component cases, not HTTP authorization or full admission acceptance. Normal static LOCAL PASS8/8 and complete DB LOCAL PASS566/23 at100% configured coverage include all33 new unit cases; actual PostgreSQL cases are NOT RUN LOCALLY, and exact-source CI is NOT VERIFIED.
