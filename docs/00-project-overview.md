# 00: Project Overview

Summary of SRS v2.0. For full detail see `docs/srs/SRS-v2.0-text.txt`. Page numbers below refer to the SRS.

## Product in one line

A **verified hostel marketplace** connected to **branch-scoped hostel operations**: bed booking, residents, monthly rent tracking, complaints and platform administration (p.1, p.4).

## Two equal pillars (p.4)

| Pillar               | Platform                                | Promise                                                                                                                                                                               |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer marketplace | **Mobile app** (Android → iOS)          | "Verified hostel. Real available seat. Real price." Location, room/seat price, seat availability, photos, deposit, amenities, menu, ratings, nearby universities, all before deciding |
| Hostel management    | **Web app** (desktop-first, responsive) | Owners manage every branch: who occupies each seat, bookings, monthly rent, proof verification, complaints, branch analytics                                                          |

**Core principle:** marketplace availability comes **from branch operations**, never from a separately editable marketing counter (p.4).

## Market & commercial model (p.1, p.11, p.40)

> **Current decision (CHG-003): subscriptions are deferred. The whole system, marketplace and management, is free at launch.** The SRS pricing below is the _future_ model, kept for reference.

- Launch geography: **Islamabad + Rawalpindi** only. The architecture stays city-extensible (SCOPE-001).
- Customers: **free**. No booking commission, no platform-held rent wallet (BR-01).
- Hostels pay **per branch**:
  - Every newly approved branch: **3-month free trial**, starting on approval date
  - Main branch: **PKR 5,000/month**
  - Each additional branch: **PKR 3,500/month**
  - Expiry is per branch: an expired branch becomes **read-only**, and other branches keep working
- Root Admin can change prices and trial length later. Already-paid periods are never repriced.

## In scope for the MVP (p.5)

- Islamabad + Rawalpindi marketplace with search, filters, university/workplace distance
- Owner multi-brand / multi-branch; Manager limited to one branch
- Room- and seat-level pricing; mandatory room + seat photos for published seats
- **Bed Board** (occupancy) and **Rent Board** (payment status)
- Booking requests, visits, in-app chat, waiting list
- Resident portal ("Active Hostel"): rent, receipts, complaints, menu, transport, checkout
- Rent paid **directly to the hostel**, with proof upload and Owner/Manager approval
- Security deposits, late fees, discounts
- Checkout + deposit settlement; verified-stay reviews
- Platform verification, subscriptions, moderation, support, announcements

## Out of scope for the MVP (p.5)

General inventory · accounting/ledger/P&L · payroll/attendance · visitor desk · AI chatbot/recommendations · sponsored ranking · platform rent wallet · automated dispute arbitration · live traffic/commute time.

> **Approved deviations from the SRS are listed in `docs/srs/CHANGES.md`**: mobile app for customers (CHG-001), password + email OTP with SMS deferred (CHG-002), subscriptions deferred (CHG-003), CNIC visibility stages (CHG-004).

## Language & UX

- English UI, with strings localisation-ready for Urdu (SCOPE-003)
- Customer side mobile-first; management desktop-first but responsive (SCOPE-002)
- Must keep working when map or SMS providers are down (p.5)

## Core flows (p.48)

```
Customer:   Search → Seat + photos → Request → Approve → Confirm (per policy) → Check-in (by management)
Rent:       Invoice → Resident pays hostel directly → Upload proof → Owner/Manager approves → Green + Receipt
Manager:    Owner appoints → 24h temp password → Manager sets permanent password → assigned branch only
Complaint:  Open → Assigned → In Progress → Resolved → Resident confirms (Closed) or Reopens
Checkout:   Notice → Financial review → Deposit settlement → Checked out → Past Stays
```

## MVP exit gate (p.50)

The MVP is done only when discovery, branch operations, active stay, rent verification and platform verification work end to end **without cross-branch data leakage or financial state inconsistency**. Quality gates:

- **ACC-001** No double-booked active seat under concurrency
- **ACC-002** No Manager can reach another branch via UI, URL or direct API
- **ACC-003** No customer sees another resident's identity, rent state or Active Hostel
- **ACC-004** Every green Paid has an approved payment + generated receipt
- **ACC-005** An expired branch becomes read-only without affecting other branches (_deferred with subscriptions, CHG-003_)
- **ACC-006** Every critical privileged action is audited

Critical authorisation, double-booking or payment-integrity defects **block launch** regardless of UI completeness.
