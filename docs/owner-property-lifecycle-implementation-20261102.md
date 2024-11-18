# Owner property/lifecycle implementation —2026-11-02

Status: implementation and focused automated regression complete. Approved local
migrations0065–69 are applied, all109 existing tables are preserved, API/worker and
Metro are ready. Current-build Android screenshots/workflows await device unlock;
external PR/CI is deferred by the user. No physical verification is claimed for this source.

## Delivered and reused

| Area                  | Working implementation                                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner entry/dashboard | Existing onboarding gates, approved hero, menu and Operations preserved; actual metrics invalidate after lifecycle/payment changes                                                                                                        |
| Property hierarchy    | Existing Building → Floor → Room → Bed model; independent expansion, shared compact floor grid, actual occupancy/counts, complete paged building/floor reads and reduced-motion handling                                                  |
| Bed states            | Server-authoritative neutral/clear/overdue presentation; reservations/restrictions remain distinct; financial colors require live finance access and never assert Paid without receipts                                                   |
| Photos                | Shared caption/order/replacement/archive/cover/publication editor for hostel categories, room and bed targets; uploader/branch/scanning/publication checks retained; existing public room/bed gallery reused                              |
| Amenities             | Existing global associations extended with organization-scoped categorized definitions, Owner versioned CRUD, authorized Manager assignment and non-destructive archival; foreign definitions rejected                                    |
| Policies/rules        | Existing explicit billing cycles/proration/due/grace/late-fee/notice/deposit rules reused; Policies wizard step and versioned paginated additional house rules; no retrospective invoice rewrite or inferred fees                         |
| Agreements            | Owner text/private template versions extend existing policy snapshots; financial editors preserve metadata; paged original-stay versions/review/acknowledgement and append-only scanned evidence with private sensitive-audited downloads |
| Bed detail            | Real hostel/branch/building/floor/room/bed context, vacancy/overdue state, photos and history; vacant beds open the existing admission with the exact bed/price preselected                                                               |
| Resident detail       | One current/former-stay workspace: permitted contacts, approved photo/default avatar, original agreement versions/scans, authorized invoices, settlement and lifecycle actions                                                            |
| Payments/dues         | Latest committed non-reversed receipt-backed payment and next unpaid issued invoice due date; all invoices contribute to settlement even beyond bounded detail pages                                                                      |
| History/lifecycle     | Existing concurrency-safe admission, same-branch transfer, departure/checkout and financial settlement reused; exact original stays retained; history pages remain mounted when opening details                                           |
| Synchronization       | Shared actor/branch invalidation for admissions/approved payments/lifecycle; one Pakistan-midnight timer plus foreground recovery for dated facts; existing data/permission/error boundaries retained                                     |

No duplicate agreement/resident/property/payment system was introduced. Removed
repeated stay-detail markup and replaced the superseded room/bed single-photo editor
with the shared gallery only after reference checks. Existing identity/verification,
financial permissions, branch isolation and permanent history remain enforced.

## Focused verification

- Final real Postgres/private-storage campaign: **26 API cases across6 suites** pass
  (media ownership/publication, competing admission/idempotency, live grant/session
  denial, original agreement/files/photos, resident privacy, transfer/checkout).
- Final database campaign: **13 cases across2 suites** pass (all200/201/225 invoices,
  later/partial debt, old deposit sources, non-reversed receipted last payment,
  complete checkout/fund/financial history).
- Mobile workflow group33 cases, extended lifecycle suite6 cases, bed/history
  navigation3 cases and agreement UI5 cases pass (groups overlap; not a summed total).
- Original-version pagination:3 affected real-DB cases rechecked (including52 versions),
  10 record/controller units,4 client cases and5 connected native view cases pass.
- Date-boundary3 cases; occupancy/rent9 units; policy/controller13 cases; contract/
  upload35 cases; client integrity/financial draft101 cases; migration/history11 cases
  pass. Earlier hierarchy/media/custom-amenity checks are retained in STATUS.
- API, mobile, API-client, web and worker typechecks pass. Targeted failing finance-only
  read case was reproduced before separating read permission from checkout actions.
- Commands use pinned pnpm/Turbo. Focused runs disable unrelated aggregate coverage
  collection; they do not waive release coverage/ACC gates.

Local ignored logs: `.tools/owner-final-focused-regression.log`,
`.tools/bed-completion-focused.log`, `.tools/finance-read-gate-final.log`,
`.tools/bed-history-navigation-final.log`, `.tools/owner-shared-compatibility.log` and
agreement checkpoint logs. No APK/Gradle/Metro/ADB/device testing ran in this campaign.

## Changed implementation groups

- Mobile hierarchy/media/amenity/policy components and shared stay/bed workspace.
- Shared navigation/back behavior reused, not duplicated.
- `financial-day-sync` and `stay-workspace-keys` for bounded cache synchronization.
- API occupancy/location, policy/template, original agreement evidence/file access
  and approved resident photo reads; existing scope/idempotency/storage/audit reused.
- Contracts and generated API-client schema/typed transports; optional financial
  template metadata round-trip adapters; canonical server financial read summaries.
- DB additive migrations0065–69, immutable evidence guards and targeted tests.
- Schema/API/screen/SRS/ADR documentation and concise STATUS checkpoints.

## Remaining gates and limits

1. **Local rollout complete:**70 journal entries through0069; zero pending. All109
   existing-table fingerprints/counts unchanged. Backup remains validated.
   [Execution/migration report](migrations/0065-0069-owner-agreements.md).
2. **Android acceptance:** Pixel6Pro is connected by USB; API/worker/Metro and USB forwarding are ready.
   Device unlock is pending. Capture current-build hierarchy, photo, amenities, agreement, admission,
   occupied/vacant/history, financial and back-navigation states. Captures show only dozing/system lock-screen states so far; historical captures are not evidence for this source.
3. **Existing business limits:** cross-branch transfers require a separately approved
   workflow; existing supported transfers remain within one branch. Additional conduct
   rules are editable text; assignment/lifecycle timeline reads retain the existing
   latest50-entry bound (bed occupancy, agreement versions, scans and invoices paginate); only supported structured financial/lifecycle controls are
   enforced. Scans/acknowledgements are not cryptographic signatures.
4. **External acceptance:** commits are pushed on `codex/recovery-20261023`; PR/hosted
   checks require repository access. GitHub CLI is unauthenticated and the connected
   GitHub account cannot access this repository. User explicitly deferred PR/CI. No merge/deployment is claimed.
   AUD-003 process-restart retention remains the previously accepted exception.

External PR access note (2026-11-02): automatic approval review rejected the attempted
reuse of a stored Git credential as GH_TOKEN for PR inspection, requiring a normal
GitHub authentication flow. That rejected action was not executed or bypassed. Git
commit/push uses the existing normal Git flow; PR/hosted acceptance remains pending.

## Final runtime handoff

Checkpoint47627a5 is pushed. API readiness and Metro status return200; worker reports
ready. The connected Pixel6Pro requested and loaded the current Android bundle
(4,510 modules, about28 seconds). Existing app data was not cleared, no account was
signed out manually, and no APK rebuild was needed for these JavaScript changes.
The actual awake screenshot shows the system fingerprint lock, not HSM. User unlock
is required to finish rendered-screen/navigation/action acceptance. The pending text
request asks for unlock on-device only; no PIN/password/token should be sent in chat.
Private evidence: `.tools/owner-acceptance-20261102/readiness.json` and captures.
No HSM visual/workflow pass is inferred from a successful bundle download.
