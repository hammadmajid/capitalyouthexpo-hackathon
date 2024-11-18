# SRS v2.31 · Transport collections

CHG-044 supplements SERV-002, FIN-001, PAY-008 and CHG-043.

- Route creation lives in mobile Hostel Setup → Amenities & Services. Operations retains live statistics, existing-route maintenance, subscription decisions and collections.
- A subscriber card uses the explicitly linked Stay's resident name. Staff require live branch finance_view. Recording external payments additionally requires payment_record. Staff Transport payments select standalone Transport invoices. Mixed historical invoices retain their existing financial workflow.
- Branch Billing Policy records due day 1–31 (clamped to the last day of short months), refundable or non-refundable, and partial-month proration. The Owner and assigned Managers with finance_view and rent_manage may append a transport-only policy version. This does not grant permission to change rent rules or approve refunds.
- New agreements capture the branch Transport policy alongside their rent policy. Existing signed terms and issued invoices are retained. Agreements without a captured Transport policy continue to use their existing monthly fee rules.
- New agreements with an explicit Transport policy issue a standalone invoice from the first covered day of the month. Legacy schedules retain their agreed timing.
- Unpaid balances are Due through the due date in Asia/Karachi and Overdue after it. Paid is receipt-backed. Balances cleared by adjustments are labeled Cleared. Included-in-rent Transport has no extra invoice.
- No migration. The additional optional policy fields are stored in the existing versioned JSON. Historical invoices, ledger entries and subscriptions are retained.
