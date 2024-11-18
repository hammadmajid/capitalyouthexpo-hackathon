# 04: Open Questions

Product decisions the SRS leaves unclear. **Do not guess these in code.** When one is answered, record it in the `docs/STATUS.md` Decision Log and mark it resolved here.

Resolved 2026-11-18 (CHG-051 / RES-001): matching an unverified typed phone must
send an account confirmation request to the hostel, requiring an active manual
resident at both request and approval. Checkout prevents linking. A unique
verified-email match links directly. See [SRS v2.35](srs/SRS-v2.35-resident-account-linking.md).

| #   | Question                                                                                                                               | Why it matters                                                    | Suggested default                                                       | Status                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | How does a customer log in after registration: password, or OTP every time?                                                            | Auth module design                                                | —                                                                       | **Resolved** → CHG-002: password login; email OTP for verification/reset; Hostinger SMTP                                                                                              |
| Q2  | How does an Owner pay the platform subscription?                                                                                       | Subscription module                                               | —                                                                       | **Resolved** → CHG-003: subscriptions deferred; system free at launch                                                                                                                 |
| Q3  | Is rent prorated for a mid-month check-in or checkout?                                                                                 | Invoice engine                                                    | Prorate by days for the first and last month, as a branch setting       | **Resolved** by Phase3 master: Owner-configured explicit proration/rounding, snapshotted per agreement; no missing-policy guess (CHG-009)                                             |
| Q4  | If the primary (PKR 5,000) branch is archived or expires, does another branch become primary?                                          | Subscription pricing                                              | —                                                                       | **Moot for now** (subscriptions deferred, CHG-003). Revisit with subscriptions                                                                                                        |
| Q5  | Rent Board colour when there is a partial payment **and** a pending proof                                                              | Rent Board UX                                                     | Yellow (action needed) wins, with a "partial" badge                     | **Resolved** (user, 2026-10-20): amber Action needed takes priority, with a Partially paid badge                                                                                      |
| Q6  | At which booking stage can management see a customer's CNIC and permanent address?                                                     | Privacy (SEC-003)                                                 | —                                                                       | **Resolved** → CHG-004: masked CNIC at request; full CNIC + address after Approved                                                                                                    |
| Q7  | Which SMS/WhatsApp OTP provider for Pakistan?                                                                                          | Cost, delivery reliability                                        | —                                                                       | **Deferred** (SMS OTP deferred, CHG-002)                                                                                                                                              |
| Q8  | Which map provider (Google Maps vs alternatives) and budget?                                                                           | Mobile maps, geocoding cost                                       | Google Maps SDK on mobile; admin-entered coordinates as source of truth | **Resolved** (user delegated best choice, 2026-10-12): MapLibre + OpenFreeMap, no required paid account; manual fallback; ADR 0026                                                    |
| Q9  | Billing day: one fixed due day per branch, or each resident's check-in anniversary?                                                    | Invoice engine (RENT-001)                                         | Branch-level due day + grace period                                     | **Resolved** by Phase3 master: Owner-configured cycle/due rules, snapshotted per agreement; CHG-009                                                                                   |
| Q10 | Can a Manager also be a resident/customer elsewhere at the same time?                                                                  | Role model edge cases                                             | —                                                                       | **Resolved by schema design** (06 §3.1): one identity, roles independent                                                                                                              |
| Q11 | Data retention periods (SRS says to define before launch)                                                                              | Legal / privacy                                                   | Decide with business/legal before production                            | Open                                                                                                                                                                                  |
| Q12 | Brand name, domain, and app store developer accounts (Google Play / Apple)                                                             | Release planning                                                  | —                                                                       | Open                                                                                                                                                                                  |
| Q13 | Does the MVP need Urdu UI at launch, or English only?                                                                                  | i18n scope                                                        | English at launch; i18n keys from day one                               | Open                                                                                                                                                                                  |
| Q14 | May management **record a cash payment directly**, with no resident proof upload?                                                      | Walk-ins often pay cash; ACC-004 still needs a payment record     | —                                                                       | **Resolved** (user, 2026-10-06): yes. Owner/Manager can record cash/direct payments (`payments.source = recorded_by_management`); audited, receipt generated, voidable only by Owner  |
| Q16 | Mobile bottom tab bar: concept's Home·Search·Explore·Saved·Profile, or Home·Search·**Stays/My Hostel**·Saved·Profile + chat in header? | Residents need daily access to rent/complaints; chat needs a home | Option A (Stays tab), see `09-design-system.md` §6                      | **Deferred** by user (2026-10-06); decide before mobile UI work (Phase 3)                                                                                                             |
| Q15 | Use Postgres Row-Level Security as a second branch-isolation layer, on top of the API guard?                                           | Defence in depth vs complexity                                    | Decide in Phase 1 after a spike                                         | **Resolved** (2026-10-08): explicitly deferred after isolated spike; ADR 0008. Application authorization mandatory; spike CI PASS 37682252135; full guard/matrix CI PASS 37692147621. |

## Revised Phase 2 decisions (2026-10-14)

Q17 resolved: Customer CNIC may be optional by Owner booking policy. Latest user
answer supersedes earlier mandatory-at-confirmation answer; CHG-007 / SRS v2.2.
Encryption, masking, private access and scanning remain mandatory when collected.
Q16 superseded for Phase 2: fixed Home/Map/Saved/Bookings/Profile, no Search tab;
source: user Phase 2 reference/master prompt. Later resident navigation remains future.

## Q18 — Pre-confirmation booking-document access — Resolved

2026-10-14: user chose owning Owner-only private document access before
confirmation; Managers see verification status only. See CHG-008 and ADR 0028.
Existing post-approval and other sensitive-resource rules remain unchanged.

## Q19 — Persist unresolved command drafts across full app restart? — Resolved

2026-10-27: the user chose “Keep restart recovery as an explicit open gap” during
AUD-003 remediation. Do not add device draft storage or a new private-payload
retention rule. The runtime correction covers remounts and ordinary backgrounding;
full process restart recovery remains an explicit acceptance limitation. ADR0075.

## Q20 — Assignment timing for historical report room filters? — Resolved

2026-10-28: the user delegated the choice to engineering judgment. Use the room
at the report's end date for snapshots and the event date for payment/checkout
history, so later transfers do not move old transactions between room reports.
Use authoritative branch-scoped assignment history; test transfer and checkout
boundaries and document date-only event handling. See ADR0079. AUD-010 now has
implemented filters/hierarchy/named Web controls and focused PostgreSQL/Chrome
evidence; the earlier pending implementation note is superseded. Coordinated
final-source acceptance remains pending in the live audit checklist.

## Q21 - Combined payment excess and transport timing - Resolved (2026-11-18)

User decision: block totals above selected bills plus explicit remaining security;
no new excess advance. Latest correction supersedes the earlier answer limiting
transport to after admission: allow optional transport at booking and after admission.
Included routes have no extra charge. CHG-055 / SRS v2.36.
