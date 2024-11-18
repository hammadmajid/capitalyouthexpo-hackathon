# HSM Transport continuation audit

Recovery baseline is `6eaf3ec` on `codex/recovery-20261023`. Commits `d63e8aa`
and `6eaf3ec` contain schema and API changes. The working tree contains an
uncommitted native workspace, its five entry points, response contracts and
component tests. The pre-existing Owner rules edit is outside this scope.

| Component          | Current status             | Existing source                                                     | Remaining work                                                             |
| ------------------ | -------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Transport domain   | Implemented but unverified | `packages/db/src/schema/transport.ts`, migration 0074               | Verify upgrade and exact current source                                    |
| Routes             | Partially implemented      | `apps/api/src/services/transport-routes.service.ts`                 | Correct draft creation and readiness                                       |
| Stops              | Implemented but unverified | Route stop arrays and typed roles in `transport-route.ts`           | Verify save, render and reload                                             |
| Schedules          | Partially implemented      | `transport-route.ts`, `transport-route-data.ts`, native trip editor | Validate publication and effective dates                                   |
| Destinations       | Implemented but unverified | `transport-route-data.ts`, native destination picker                | Verify catalog selection and persisted values                              |
| Pricing            | Partially implemented      | Route pricing mode and version, `transport-route-data.ts`           | Replace inferred eligibility with captured terms                           |
| Subscriptions      | Partially implemented      | `transport-subscriptions.service.ts`, per-Stay/route unique index   | Correct route readiness and verify multiple subscriptions                  |
| Billing            | Implemented but unverified | `packages/db/src/transport-billing.ts`, existing posting plan       | Verify combined subscriptions and immutable periods                        |
| Owner Operations   | Partially implemented      | Native workspace, `apps/web/src/components/services/transport.tsx`  | Verify scope, navigation and web controls                                  |
| Manager Operations | Partially implemented      | Native manager section registry and branch wrapper                  | Verify live grants, cache clearing and decisions                           |
| Setup Wizard       | Partially implemented      | `owner-amenities-step.tsx`, `transport-setup.tsx`                   | Persist private draft routes and reopen them                               |
| Marketplace        | Partially implemented      | Public branch guard, native public service component                | Verify private draft exclusion and equivalent web disclosure               |
| Resident Portal    | Partially implemented      | Native Resident Transport and existing web Stay Transport           | Verify eligibility, history, payment disclosures and cancellation          |
| Contracts/SDK      | Partially implemented      | `transport-route.ts`, `resident-services.ts`, generated SDK         | Three Transport contract tests pass. Check downstream types and generation |
| Tests              | Partially implemented      | Route/trip, transport billing, native Transport and SDK suites      | Run disposable PostgreSQL, functional coverage and acceptance checks       |

Development migration and physical Android acceptance are pending evidence.
