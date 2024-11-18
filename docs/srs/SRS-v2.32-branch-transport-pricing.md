# SRS v2.32 · Branch Transport pricing and route directions

CHG-046 supplements SERV-002, FIN-001, PAY-008 and CHG-042–045.

- Transport is optional. Route setup manages destinations, stops and schedules. Each schedule has a hostel-to-destination departure and an optional destination-to-hostel departure. Same-day and next-day validation uses Asia/Karachi time.
- The branch Billing Policy is the source for customer pricing. Included mode covers the published routes set by the hostel. Separate mode publishes one branch monthly fee and requires a due day, refund rule and partial-month rule. Published routes remain visible when no pricing mode is set. New separate subscriptions require the branch's published fee.
- Booking quotes and walk-in agreements capture their included routes. Published policy changes apply to new offers. Existing agreed inclusion, subscription fees, billing schedules and issued invoices retain their recorded terms.

## Migration 0076

The migration allows new schedule-only routes to store zero in the legacy fee column and adds nullable route ID and branch Transport billing snapshots to stay agreements. The historical branch fee constraint continues to cover positive legacy route prices. Existing routes, policies, agreements and subscriptions keep their stored values. Each branch with existing routes selects its pricing mode in Billing Policy to publish new offers. A room-type rent override keeps its selected policy while the agreement separately captures branch Transport billing. Previously signed walk-in agreements retain the historical inclusion-date lookup.
