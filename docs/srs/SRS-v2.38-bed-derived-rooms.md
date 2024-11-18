# SRS v2.38: Bed-derived rooms and admission security

User-approved 2026-11-21. CHG-057 / ROOM-002 / BED-001 / BKG-003..005 / RES-001.
This supersedes the Add Room count/deposit/batch-bed portion of CHG-056.

Hostel Setup creates an empty room from its room number and photo. It never asks
for a planned bed count, shared rent or security deposit. Beds are added separately
with their own prices. One non-archived physical bed makes a one-bed room; four
make a four-bed room. Maintenance/occupied status does not change physical size.
Archiving a bed reduces size; changing its label does not. Existing claim guards,
immutable bed IDs/ordinals and branch permissions remain enforced.

Search capacity filters must match the physical count of the selected room, not
a shared type's configured limit. A type summary reports the largest actual room
in that group; each room also exposes its own count. Empty setup rooms are not
publicly selectable. Existing shared-type financial terms and accepted snapshots
are not repriced or rewritten when physical size changes.

New setup-managed per-bed type containers may initially have no rent and zero
beds. This means unconfigured, never a free bed. Each new bed in such a room must
receive an explicit price before it can be quoted. Shared room-type price/deposit
editing is unavailable for these containers. Existing legacy type APIs/financial
history remain compatible. Old bulk type-based duplication does not manufacture
beds for setup-managed rooms; their rooms/beds are authored individually.

Security is agreed for the selected bed/resident when creating the admission
agreement using the existing explicit security field and obligations workflow.
There is no room-level security preset in new setup. Zero in an empty container
is no advance security obligation; it is not a historical security write-off.
Existing booking quotes, paid security, rent agreements, invoices and receipts
retain their captured amounts and approval rules. No platform custody is added.

Migration note: additive setup_managed flag and guarded nullable setup rent.
The current-room-types view derives its count from retained physical inventory;
legacy configured capacity remains stored for history but no longer blocks adding
beds. The seat trigger retains parent locks and immutable identity protection.
No beds are invented/deleted and no money/snapshot backfill occurs. Local-only
migration follows disposable database verification; final acceptance is separate.
