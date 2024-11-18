# Terminal billing recovery — AUD-013

RENT-004 / SEC-003 / ACC-004. Restricted to an operator already authorized to use
the Worker's database credential. Application users cannot call this capability.
Use the controlled maintenance host and its existing credential-access procedure;
record operator identity, approval, dependency repair and the incident reference
in the incident. Do not put credentials, resident details or free text in arguments.

1. Confirm the dependency is healthy. Inspect the exact dead `resident.billing.period`
   job and its active schedule through approved database tooling. Record branch ID,
   job ID, attempt count, safe error code, schedule version/cursor and current pointer.
   A worker restart alone does not recover dead work. `INVALID_MESSAGE` jobs require
   diagnosis rather than this command. Do not edit amounts, invoices or schedule dates.
2. Use the verified source and cached build: `pnpm turbo run build --filter=@hsm/worker`.
   With the existing ignored `.env.worker` configured, run:

   ```text
   pnpm turbo run start --filter=@hsm/worker --only -- recover-billing <branch-uuid> <job-uuid> <observed-attempts> INC-013 --apply
   ```

   Replace the incident reference with the approved restricted identifier. Exactly
   one job is considered. Missing/extra arguments fail closed. This maintenance
   invocation exits after completion and does not start a second dispatch loop.

3. Success logs only `BILLING_RECOVERY_REQUESTED`. Confirm one immutable
   `billing.job.recovery.requested` audit containing the incident and prior attempts.
   Failure returns a nonzero exit and a sanitized startup failure; inspect the state
   before retrying. Recovery and its audit are atomic. No automatic broad requeue exists.
4. Let the normal dispatcher claim the pending job. Verify its sent state, exactly
   one period invoice/source and execution, `billing.execution.completed` audit,
   and the schedule's next cursor/job (or legitimate finite exhaustion). A command
   success means queued, not invoice posted. Investigate renewed failures; each
   manual budget is separately audited. Never delete dead jobs or financial history.

No deployment or recovery of real resident records is authorized by test execution.
Focused disposable verification and final campaign status are tracked in STATUS.
