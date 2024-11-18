# SRS v2.27 — Staff Management & Salary Tracking (CHG-039)

Approved by the user on 2026-11-15 as a narrow extension of the deferred payroll scope.

## Scope

- Branch-local staff records (name, optional phone, job title, start/end dates, status
  active | inactive | ended). Staff never receive an HSM login, Customer identity or
  Manager capability, and are never matched to users by name, email or phone.
- Versioned monthly salary terms (amount in paisa > 0, due day 1–28, effective month).
  A new version applies to future unissued months; issued salaries are never repriced.
- One salary obligation per staff member per calendar month. Full months are issued
  idempotently from the terms in force; months where employment starts or ends mid-month
  need an explicit authorized amount (zero allowed only when entered explicitly).
- Record-only external payments (cash, bank transfer, mobile wallet, other) with partial
  payments and reversals. HSM never sends, holds or settles salaries. Net payments never
  exceed the obligation.
- Status from the Asia/Karachi date: paid; otherwise unpaid (before the due date),
  due today, or overdue (after it); `partial` is shown alongside the timing state.
- Versioned staff agreements with optional private scanned file (purpose
  `staff_agreement`, private bucket, scanned, audited access).
- Optional "Staff & Salaries" setup step; Owner and Manager Staff tools in Operations.
- Platform Admin sees only the active staff count on hostel/branch explorer records.

## Permissions

- Owners: everything for their own branches.
- Managers: new grants `staff_manage` (directory, add/edit/deactivate) and
  `staff_payroll_manage` (salary terms, salaries, payments, agreements; requires both).
  Both are OFF by default and are excluded from the CHG-029 automatic full-branch grant;
  only the owning Owner grants or revokes them. Every read and command rechecks grants.

## Exclusions

Attendance, leave, tax, provident fund, deductions, allowances, overtime, payslips,
bank integrations, automated transfers, staff logins/self-service, recruitment,
performance reviews, ledgers, customer-facing staff data.
