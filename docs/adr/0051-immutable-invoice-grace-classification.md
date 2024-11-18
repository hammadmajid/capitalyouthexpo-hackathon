# ADR 0051: Invoice overdue classification uses original agreed grace

- Status: implemented; local contract/DB unit/static checks passed; real acceptance pending
- Date: 2026-10-19
- Refs: RB-002, FIN-002, RENT-004, PAY-008, CHG-013, SRS v2.8

## Decision

Keep one canonical invoiceBalance implementation. Require explicit validated grace
and compare exact elapsed calendar days to the agreed grace interval. Preserve
all money, original due dates, zero/waiver/void/approved-payment behavior and the
existing calendar helpers. A very large grace cannot overflow date construction:
compare bigint elapsed days rather than materializing an unsupported end date.

The internal invoice reader resolves the original policy.graceDays through scoped
immutable invoice/charge/agreement links. Select at most two distinct values,
validate one unambiguous nonnegative safe integer, and fail closed otherwise.
Never substitute a branch's current policy, guess zero or load an unbounded
agreement history. Normal writers already issue one agreed source per invoice.

## Migration and verification

SRS v2.8/CHG-013 records the rent-state correction. No physical migration or
financial-history rewrite. Keep every existing financial test; explicit zero in
legacy fixture input preserves its original assumption. The complete RED run
reproduced18 failures with629 assertions passing out of647/44 suites. New cases
cover grace expiry, leap/month boundaries, partial/settled/waived/void invoices,
large grace and invalid/missing input. Complete fixed contracts pass 647/44 and DB units 159/7 at 100% all configured dimensions; static checks pass 5/5 and 8/8 respectively. Nine actual invoice/grace PG cases remain NOT RUN LOCALLY; transitive API/client checks and exact-source CI acceptance are still required. No real integration pass is implied.
