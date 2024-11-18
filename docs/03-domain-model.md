# 03: Domain Model & Business Rules

Logical model from SRS p.46–47. The physical schema will be designed in `docs/06-database-schema.md` (pending).

## Entities by domain

| Domain               | Entities                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Identity             | User, CustomerProfile, OwnerProfile, ManagerAssignment, Role, Permission, Session, VerificationRecord (OTP)                    |
| Geography            | City, Area/Sector, SubArea, University, Workplace/BusinessHub, GeoLocation, aliases                                            |
| Commercial           | OwnerOrganization, HostelBrand, Branch, BranchSubscription, SubscriptionPayment, SubscriptionExtension                         |
| Property             | Building, Floor, Room, RoomType, Seat (bed)                                                                                    |
| Listing content      | HostelPhoto, RoomPhoto, SeatPhoto, Amenity, RoomAmenity, HostelRule, VisitingSchedule, CancellationPolicy, BranchPaymentMethod |
| Verification         | HostelVerification, VerificationDocument, VerificationStatusHistory                                                            |
| Booking              | BookingRequest, BookingStatusHistory, SeatReservation, VisitRequest, WaitingListEntry                                          |
| Resident             | ResidentStay, BedAssignment, BedTransfer, Guardian, EmergencyContact, ResidentDocument, AgreementAcceptance                    |
| Finance              | Invoice, InvoiceItem, Payment, PaymentProof, Receipt, SecurityDeposit, SecurityDeduction, Discount, LateFee, AdvanceBalance    |
| Services             | WeeklyMenu, MealItem, TransportService, Route, Stop, ResidentTransportSubscription                                             |
| Communication        | Conversation, ChatMessage, Attachment, Notification, NotificationOutbox, Announcement                                          |
| Complaints / reviews | Complaint, ComplaintStatusHistory, Review, ReviewRating, ReviewReply, Report                                                   |
| Platform             | AdminAccount/roles, SupportTicket, PlatformAuditLog, HostelAuditLog                                                            |

## Key relationships

- Owner (organisation) **1..\*** Brand **1..\*** Branch **1..\*** Building → Floor → Room → Seat
- ManagerAssignment = User + **exactly one** Branch (MVP)
- Seat has **at most one** active BedAssignment
- Customer has **at most one** active ResidentStay
- Customer has **at most three** active BookingRequests
- Branch has its own verification state and subscription state
- One verified stay → at most one main Review

## State machines

### Seat (internal; BED-001)

```
Available ⇄ Reserved      (reservation created / expired / withdrawn)
Available → Occupied      (check-in or walk-in, atomic)
Reserved  → Occupied      (check-in of confirmed booking)
Occupied  → Available     (checkout completed, or transfer out)
Available ⇄ Maintenance
```

- Occupied is **derived** from an active assignment and cannot be toggled manually.
- Reserved and Maintenance show as "not available" publicly (no reason shown).
- Publicly selectable only if: Available + room photos + seat photo + branch approved + subscription active.

### Booking (p.22)

```
Draft → Submitted → Under Review → Approved
  → [Payment Pending → Verification Pending] → Confirmed → Checked In → Completed
Side exits: Rejected (reason required) · Withdrawn (customer) · Expired (auto, rule logged) · Cancelled
```

### Resident stay (p.24)

```
Booking Confirmed → Upcoming Stay → Checked In (Active Hostel) → Checkout Requested → Checked Out (Past Stay)
```

Only the Owner or the assigned Manager can check a resident in. Walk-ins enter directly at Checked In.

### Invoice / Rent Board (p.29)

| State         | Colour  | Rule                                                  |
| ------------- | ------- | ----------------------------------------------------- |
| Due           | Neutral | Issued, before due date + grace                       |
| Proof pending | Yellow  | Proof submitted, awaiting approval                    |
| Partial       | Orange  | Partial payments enabled and approved total < balance |
| Overdue       | Red     | Unpaid after due date + grace                         |
| Paid          | Green   | Approved payment(s) cover the invoice; receipt exists |
| Vacant        | Silver  | No active resident on seat (not a financial state)    |

Always show a **label/icon as well as the colour** (accessibility).

### Payment proof

`Submitted → Pending Verification → Approved (→ Receipt) | Rejected (reason; resident may retry)`

### Complaint (p.33)

`Open → Assigned → In Progress → Resolved → Closed (resident accepts) | Reopened → In Progress …`

### Listing verification (p.16)

`Draft → Submitted → Under Review → Changes Requested ⇄ Submitted → Approved | Rejected; Approved → Suspended`

### Branch subscription (p.40): **DEFERRED (CHG-003)**

For now each Branch only has `plan_status = 'free'`. The full machine below is for the future:
`Trial (3 months from approval) → Active → Expiring → Expired/Read-only → (renewal) Active`; plus `Complimentary` (Root, with reason + expiry)

### Manager

`Appointed → Temporary Access (24h) → Active → Suspended ⇄ Active | Deactivated`

## Non-negotiable business rules (BR-01..05 + key rules)

- **BR-01** Customers free; no commission; no platform rent wallet.
- ~~**BR-02** PKR 5,000 main / PKR 3,500 additional, after each branch's own 3-month trial.~~ Deferred (CHG-003): free at launch.
- **CNIC visibility (CHG-004):** management sees masked CNIC on a request; full CNIC + permanent address only after Approved or for a walk-in.
- **BR-03** One Active Hostel per customer.
- **BR-04** One branch per Manager (MVP).
- **BR-05** The public seat view never exposes occupant identity or rent state.
- Booking price is locked at request time (BKG-004). No hidden booking fee (BKG-005).
- Payment required before confirmation is configurable per branch, and goes **directly to the hostel's account** (BKG-007/008).
- Reservation/offer expiry is branch-configurable and auto-released (BKG-010).
- Issued invoices are never silently rewritten. Rent changes are effective-dated (RENT-003).
- Deposit changes apply only to new bookings (FIN-001). Late fee: fixed / % / manual / disabled (FIN-002).
- No arbitrary one-time charges in MVP (FIN-004). Optional transport is charged separately (RENT-006).
- Reviews: verified stay ≥ 30 days; management can reply but not edit or delete (REV-*).
- _(Deferred with subscriptions)_ An expired branch is read-only. Its public listing shows "Availability confirmation required" (SUB-005).
- Platform admins never edit hostel rent, rooms or deposits (ADM-008).
- Room capacity cannot drop below the current occupied seats (PROP-002).
