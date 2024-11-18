# ADR 0063: Current admission conflicts and agreement binding

- Status: Source implementation; verification pending
- Date: 2026-10-21
- Refs: STAY-001, RES-004, RENT-003, FIN-004, SEC-003, ACC-001/004; CHG-009/010/014

## Decision

Actual admission uses server Karachi today. Under the authorized private target locks, a bounded conflict query covers exact branch/room/bed, whole-room claims, active reservations and maintenance, and every unreleased physical assignment regardless of its expected departure. Finite departure must produce a positive actual occupancy interval; open-ended periods retain no artificial upper sentinel. Adjacent historical reservations and expired holds are ignored for overlap. The composing transaction must expire reservations before inserting claims, retain database exclusion guards and validate the disclosed open-ended policy. This helper has no reservation-ignoring argument and does not implement booking handoff.

Manual agreements bind to the most specific current type/branch/hostel/platform policy and exact policy facts. A missing or superseded version requires reload. Query at most five policy rows to detect corrupt lineage and hold shared locks through transaction completion. Each selected catalogue entry must match an active exact branch entry and its immutable disclosed code/name/unit/integer-paisa price; no arbitrary fee, inferred rent or deposit, contact merge or financial rewrite is introduced.

Live identity/session, delegated stay/rent/finance grants, validated active hierarchy/type, ordered participant locks and authorized idempotency remain caller duties. These internal helpers do not expose an endpoint, create occupancy, approve payment or release inventory. The complete admission still commits resident/Stay/agreement/assignment/claim, initial billing, history, audit and outbox together.

## Verification

Boundary units and twelve real availability plus eight real policy/catalogue cases are authored. All18 availability and40 agreement boundary cases pass within complete DB646/26 at100% configured coverage. Latest normal static8/8 passes with28 baseline DB warnings and no new warning. Earlier table typing, unused mock arguments and exact SQL timestamp assertion failures remain recorded in STATUS.md; no case or threshold was removed. All actual PostgreSQL cases are NOT RUN LOCALLY, exact-source CI is NOT VERIFIED. Existing Testcontainers tests and coverage gates are retained.
