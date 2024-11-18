# ADR 0059: Owner payment reversal transaction component

- Status: source implementation; verification and complete HTTP workflow pending
- Date: 2026-10-20
- Refs: Q14, PAY-008, RENT-005, FIN-001, AUD-004, ACC-001/004; ADR0044

## Decision

Retain the existing Owner-only reversal rule and all original immutable financial SQL guards. An internal strict command requires a human Owner-attributed scope, exact payment and explicit reason. Caller must still prove actual owning authority, live identity/session, authorized replay and mandatory notifications inside the command transaction. The scope object is not a public authorization substitute. No route/export or deployment is enabled by this component.

Lock hierarchy/Stay/payment and require its same-scope immutable receipt. Reject an already reversed, foreign, malformed or unreceipted payment. Read at most103 original entries to validate the contract maximum102 (100 invoice allocations plus deposit and advance). Validate source identity, positive integer paisa, account/invoice association and conservation against the approved amount.

Before full reversal, require the original payment's own remaining deposit/advance to cover all original fund credits. Another payment cannot cover a spent source. Spent funds need an explicit resolution workflow; do not create negative liabilities, mutate a source movement, silently refund externally or erase debt. Existing SQL remains the final transaction-completeness/concurrency backstop.

Append the reversal, exact opposite debits tied to original entry IDs, and mandatory human audit together. Failure rolls back the entire transaction. Never update/delete the original payment, allocations, receipt or invoice. The private receipt reader retains original historical facts and derives reversed status; invoice balance derives the original and opposite receipt-backed allocations.

## Verification

New units cover bounded conservation, source/receipt facts, exact opposites, spent funding, Manager/system denial, required-write failure and malformed input. Six real PostgreSQL cases cover retained history/invoice restoration, concurrent reversal, spent-source isolation, foreign payment, Manager attribution and audit rollback/retry. All34 local reversal cases pass within the complete492-case/21-suite DB gate at100% configured L/S/F/B. Normal DB static8/8 passes with28 baseline warnings/no new warning. The six actual PostgreSQL cases are authored and NOT RUN LOCALLY; current evidence remains in STATUS.md. No Phase3 or CI acceptance is implied.
