# SRS v2.18 — controlled identity and photo review

User Platform Admin completion scope (HMA-015, ADM-008, SEC-003), extending v2.17.
Migration generation and disposable-database application explicitly authorized;
development application and deployment remain outside this authorization.

- Verified, password-enabled ordinary identities may request legal-name/CNIC
  correction with a meaningful reason and owned, clean, private proof. CNIC changes
  require ordered front/back evidence. One pending request per subject and kind.
  Contacts and privileged Admin identities use their existing separate procedures.
- Root reviews identity corrections. Root/content moderators review profile photos.
  Reviewers cannot review themselves or Admin-linked subjects. Metadata lists omit
  names, CNIC and evidence URLs. Private details/file access require an audited
  justification; signed links bind to the exact clean, private, subject-owned proof.
- Decisions require confirmation, reason, current version and an unchanged profile
  baseline. Approval changes only requested identity fields; CNIC is encrypted and
  indexed by domain-separated HMAC. Existing Owner proof pointers follow approved
  CNIC changes. Identity approval revokes sessions and requires a fresh login.
- Photo approval replaces the avatar. Rejection leaves an existing unrelated avatar.
  Staff can open a reasoned case against a legacy current photo without inventing an
  earlier approval. Such cases cannot be cancelled by their subject; rejection or
  withdrawal removes only the matching current photo. Subjects may cancel ordinary
  pending submissions. History and proof references are retained, never overwritten.
- Transactional decisions, append-only history/audit and generic in-app notices
  contain no private identity details in general audit or notification payloads.
  Privacy cleanup discards displayed details and URLs on focus loss. Uncertain
  commands retain their original intent/key for explicit retry while mounted.

## Migration note

Generated additive migration0063 creates private requests, ordered evidence and
immutable decisions. Database guards enforce immutable payload/evidence/history,
legal versioned transitions and a durable decision for each transition. Enable
`PROFILE_REVIEWS_ENABLED` only after coordinated schema rollout and readiness checks;
it defaults to false. When enabled, direct Owner/Customer avatar replacement cannot
bypass review. Existing0062 is also a separate development rollout dependency.
Only disposable databases have received0063. Release and physical-device acceptance
remain separate gates; this requirements version does not certify acceptance.

Development rollout update (2026-10-31): user separately approved0062/0063 application.
Both now applied after a local backup. Migration history, unchanged existing-table
fingerprints and schema guards verified. This supersedes the historical disposable-
only application statement above; activation, Android and deployment remain separate.
