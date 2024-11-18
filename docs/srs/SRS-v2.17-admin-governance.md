# SRS v2.17 — governed Admin decisions

Approved scope: user Platform Admin completion directive, 2026-10-30. This additive
version extends v2.16 and the original SRS; unrelated product rules remain authoritative.

## HMA-015 / ADM-008 / SEC-003

- Root institution writes require a meaningful 8–500 character reason and, for
  updates, the latest expectedRevision. Name, short name, city/area, address,
  coordinates and aliases are material. Retaining public approval after material
  changes requires explicit Root reapproval; alternatively Root withdraws approval.
  Unchanged approved identity preserves prior approval provenance. Withdrawal clears
  approval metadata; subsequent approval records current authority and time.
- Existing append-only platform audit stores allowlisted previous/updated institution
  fields, actor, time, reason and preceding revision. Root-only history is bounded and
  paged; missing legacy snapshots are unavailable rather than reconstructed.
- Root or current content_moderator may warn, suspend, ban or reinstate eligible
  customers. Customer profile membership is required; self, every Admin-linked
  identity, Owners and active Managers are excluded. Existing Admin authority changes
  remain confined to the Root membership workflow. Deactivated/unclaimed accounts
  are outside customer enforcement scope.
- Decisions require a reason and matching account status/update timestamp, with
  transactional audit and idempotency. Suspend/ban revoke sessions. Reinstatement
  never revives revoked sessions. Generic in-app notices contain no private reason,
  contact or identity document. Retry preserves the original complete request.

## Migration and acceptance note

These governance changes reuse existing tables and require no new migration.
Previously generated 0062 remains a separate, unapplied snapshot rollout dependency.
Identity-correction/photo-review submission storage is still absent; generating or
applying its migration requires explicit authorization. Android/device and deployment
acceptance remain separate pending gates. This version is not acceptance evidence.
