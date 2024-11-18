# SRS v2.42 — Rent-aligned transport invoices

User-directed 2026-11-22. SERV-002 / RENT-003/004 / PAY-008/009 / ACC-001/004.
CHG-061 supersedes independent monthly transport due dates for new postings.

- Transport routes/destinations are configured in Hostel Setup. Owner Transport
  Operations shows Transport subscribers, actionable Requests and transport-only
  monthly fees; omit route editors, destination counts and trips-today counts.
- A resident subscription request remains requested and unbilled until authorized
  hostel approval. Requests open a status-filtered queue with approve/reject.
  Approved booking transport retains its existing approved booking/check-in flow.
- Monthly transport uses the rent cycle and due date, retaining its captured price,
  approved covered days, included-in-rent exemption and proration. Nonmonthly rent
  retains the explicit monthly transport cycle; do not turn a monthly fee into a
  daily or weekly full-price charge. A start after the due date is issued no earlier
  than the approved start. No historical invoice is rewritten.
- New monthly rent/transport charges for the same unbilled period are issued in one
  transaction on one invoice, with distinct classified charge lines. Lease/replay
  and concurrent jobs cannot issue them twice. If part of that period was already
  invoiced, preserve it and issue the remaining obligation separately; collections
  may cover both with one proof/receipt. Never mutate an already published bill.
- Show rent, transport and outstanding refundable security separately, with one
  total payable: 10,000; 10,000 + 10,000 = 20,000; or 10,000 + 10,000 + 5,000 = 25,000.
  Security is a liability component, not rent revenue or an extra rent allocation.
  Receipt-backed security already received is excluded; pending security evidence
  is shown separately and cannot be collected again. A proof is not a paid receipt.
- Invoice details and image/PDF/share exports show classification and the combined
  payable total. Staff collection and resident payment can include transport with
  rent/security. Overpayments remain blocked; original financial records persist.

## Migration note

Drizzle-generated migration 0088 changes billing origins to a composite execution/charge key and indexes shared invoice IDs. Updated deferred guards require exact scoped execution/primary item proof, an authorized companion schedule, approved subscription coverage and a complete matching invoice total. Existing origin rows and immutable invoice guards remain; no historical reclassification occurs. Existing issued
bills, receipts, captured amounts and audit history remain unchanged. The planner
aligns future monthly transport periods/dates; old periods already posted remain
subject to overlap/idempotency guards and explicit adjustment if their historical
cycle conflicts. Existing persisted jobs are replay-safe; rent and transport jobs
resolve to the same newly issued invoice when both period charges are unissued.
Invoice response fields are additive optional producer fields for compatibility.
No production rollout is authorized; local focused checks precede acceptance.
