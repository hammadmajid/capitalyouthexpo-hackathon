# SRS v2.37 — Individual physical-bed rent

User-directed 2026-11-20; CHG-056; ROOM-002 / BED-001 / BKG-003..005 / ACC-004 / ACC-006.

Hostel Setup has no room-rent card or whole-room rental choice for new rooms.
Each physical bed has an independently authored monthly rent in integer paisa.
Creating a room asks for the initial rent of each named bed; creating another bed
asks for its own rent. All new native setup beds receive their price atomically
with bed creation. A later bed edit publishes an immutable effective-dated version
for that exact bed. Versions with the same effective date are ordered by their
new immutable version ID; corrections never overwrite history.

Live owner scope or an assigned manager with inventory_edit + pricing_edit is
required for every price write, including idempotent retries. Reads are scoped
inventory reads. Cross-branch and archived parent/bed targets are denied. Each
write is audited in the same transaction and serialized on branch/bed locks.
Publishing a bed price cannot reprice another bed, accepted booking, current
resident agreement, issued invoice or historical receipt.

New booking quotes use the selected (or actually allocated) bed's effective rent.
Public bed choices show that same rent, and discovery price ranges/filters use
individual bed rates. Deposits, fees, eligibility and payment policies retain
their existing source and captured rules; this change introduces no new fees.
Manual admission defaults to the selected bed's current price while retaining
the existing explicit agreement flow.

Migration note: additive bed_prices table and append-only guards (0082/0083).
Existing beds retain their legacy effective room-type fallback until management
explicitly sets their individual rent. There is no invented zero, historical
backfill, or mutation of existing whole-room bookings. Legacy whole-room contracts
and APIs remain readable/operable; removing their history is not authorized.
The new native setup creates per-bed inventory only.
