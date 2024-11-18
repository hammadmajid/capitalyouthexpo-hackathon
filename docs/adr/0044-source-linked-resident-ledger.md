# ADR 0044: Source-linked resident ledger and payment conservation

- **Status:** Accepted for implementation; migration/runtime verification pending
- **Date:** 2026-10-18
- **Source:** Phase 3 master prompt; CHG-009; RENT-003/005, PAY-008/009, FIN-001/004, OUT-004/005

## Context

Residents need truthful charges, invoice allocations, deposit liabilities, advance
credit and explicit corrections. HSM records external hostel payments; it does not
hold money, verify banks automatically or implement a general ERP.

## Decision

Use immutable, source-linked ledger postings with three resident accounts:
receivable (debit minus credit), deposit and advance (credit minus debit).
Every positive bigint-paisa posting references exactly one real charge,
adjustment, approved payment, fund movement or payment reversal through scoped
foreign keys. No generic client ledger-write endpoint is introduced.

An approved external-payment record must commit with one immutable receipt and a
complete distribution of its amount across invoice allocations, deposit and
advance. An invoice allocation is a receivable credit in this same ledger; do not
maintain a second independently mutable allocation total. Invoice document state
is issued/voided only. Paid/partial/overdue/no-charge are derived, with receipt-backed
approved payment provenance; proof upload never creates an approved payment.

A deposit/advance application retains its original funding payment and posts the
corresponding fund debit and invoice credit together. Deductions and externally
recorded refunds reduce the separate fund account. No source fund may go negative.
Reversal postings retain their original entry, amount/account/invoice and reason
rather than editing history. Payment reversal remains Owner-only under Q14.
Complex correction/unwind cases require an explicit workflow, never silent money
loss or a negative held balance.

Charges retain agreed description, amount, period and agreement reference.
Recurring source keys and source-specific ledger uniqueness protect retries.
Custom charges reference an approved Owner-controlled catalog and disclosed policy;
each immutable catalog version specifies a unit price in integer paisa and a unit label.
The agreement discloses those exact catalog facts; quantity times that unit price
must equal the posted charge. A catalog price change requires a new record and an
explicit agreement amendment, never rewriting an existing resident agreement.
There is no free-form arbitrary invoice fee. Invoice face value is immutable and
must reconcile to its charge links; later corrections remain separate records.
Voiding must also post an explicit balancing credit, so document state cannot hide
unpaid ledger debt. Debit amendments remain separate from the original face value.

Use a protected ephemeral per-transaction subject-check queue to deduplicate deferred
validation. Each affected payment/invoice/funding subject is checked once, avoiding
repeated whole-distribution checks for every allocation row. The validator removes
only its internal queue rows; all historically referenced financial records remain
immutable. Queue update/truncate and direct delete are denied. This is a constraint
implementation detail, not a worker/outbox or a ledger-history replacement.
Actual runtime/query-plan performance still requires PostgreSQL verification.

## Consequences

Database source/completeness/retention guards and actual transaction tests are
required before any financial mutation route is enabled. Schema declarations
alone are not a working ledger/payment flow. Every command still needs live
scope/grants, lock order, authorization-bound idempotency, mandatory audit/outbox,
private proof validation and bounded queries/aggregates. Receipt rendering uses
the existing private storage/worker model without mutating financial facts.

Additive Drizzle migrations0020..0023 and custom source/completeness guards are
authored. Local declaration/contract checks are in progress. Real PostgreSQL
execution, rollback/concurrency tests, replay and combined acceptance remain pending.

## Invoice projection implementation follow-on (2026-10-19)

An internal read component now share-locks the exact scoped Stay and reads the
scoped invoice plus two server-side aggregates. Posted adjustments join their
ledger entries and invoice charge links. Allocated value is the net receivable
credit/debit with an original funding payment joined to its immutable receipt.
This includes approved deposit/advance applications and opposite reversal entries;
proof files and unspent fund balances never become invoice payments. Reuse the
canonical shared invoiceBalance function; a fully waived invoice is no_charge,
not Paid. Reject missing/unsafe/inconsistent stored totals rather than defaulting
to a zero balance. Caller live authorization and Stay-lock discipline for writers
remain mandatory; historical financial reads do not confer mutation authority.
No new endpoint or physical migration is introduced. Sixty invoice/grace unit cases and nine real PostgreSQL scenarios are authored, including an actual NOWAIT contention/release test for the shared Stay read lock with no arbitrary sleep. Complete DB units pass 159/7 at 100% all dimensions across six scoped production modules; static 8/8. Original agreement grace is resolved separately through scoped charge links (CHG-013 / ADR0051). Real cases remain NOT RUN LOCALLY.
