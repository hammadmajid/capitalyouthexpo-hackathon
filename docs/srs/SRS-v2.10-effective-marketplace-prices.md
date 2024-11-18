# SRS v2.10 implementation supplement: effective marketplace prices

This implements the existing v2.0 p.18 price-effective-date rule and BKG-004 under
the approved Phase3 marketplace directive. It introduces no new adjustment,
rent, authorization or booking-state policy. Room types remain configurable and
provide the runtime's shared room/bed prices. A price change records its explicit
effective calendar date, complete rent/deposit/disclosed fees and attributed
creation history. The latest effective version supplies current displayed prices
and newly captured booking quotes. Calendar dates use the existing Asia/Karachi
display convention. The v1 planned unique effective date is retained at the
implemented room-type scope.

Existing confirmed booking amounts and issued invoices remain unchanged unless
the separately approved explicit adjustment workflow applies. This Phase3 change
does not execute an adjustment or activate resident admission/finance mutations.

## Migration note

Add generated Drizzle0048 room_type_prices and custom generated0049 read view and
immutable history/mode guards. Do not modify earlier migrations or rewrite any
existing booking, invoice, agreement or legacy price row. Legacy configuration is
the fallback until the first due explicit version; no invented backfill date.
Update scoped management APIs and both clients with dated publication/history,
and resolve the same effective prices in public discovery and new booking quotes.
Existing branch/grant/session checks, audit, idempotency and disclosure boundaries
remain authoritative. ADR0069; implementation/verification in STATUS.md.
