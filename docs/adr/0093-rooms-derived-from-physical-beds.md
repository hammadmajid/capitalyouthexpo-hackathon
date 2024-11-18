# ADR 0093: Rooms derive size from physical beds

- Status: Accepted
- Date: 2026-11-21
- Decision owner: User Hostel Setup direction

## Decision

Create empty setup-managed per-bed containers rather than asking for a planned
capacity/deposit. A nullable setup price represents unconfigured inventory;
quotes require a real per-bed rate. The existing current-type view reports the
maximum actual room count, while room DTOs/search filters use that exact room's
non-archived physical beds. Keep legacy configured metadata and financial captures.

## Consequences

Adding/archiving beds changes classification without editing agreement prices.
Room/bed identity locks, live-claim restrictions, private media rules and audit
remain authoritative. Security stays in the existing per-resident admission flow.
Legacy type-based batch duplication is unavailable for setup-managed containers.
See CHG-057 and SRS v2.38 for migration/compatibility details.
