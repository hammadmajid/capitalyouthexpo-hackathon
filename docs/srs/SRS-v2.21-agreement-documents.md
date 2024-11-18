# SRS v2.21 — versioned agreement text and private scanned evidence

User-authorized property lifecycle master: STAY-002 / RES-005 / SEC-003.
Owner-authored agreement titles, text and an actor-owned clean private template file
extend the existing versioned billing policy. The template editor requires the exact
effective policy version and preserves financial fields. Admission snapshots carry
that version's text/document; later edits/removal affect future eligible stays only.
Financial editors preserve template metadata. No new financial defaults, retrospective
charges, mandatory signature gate or cryptographic-signature claims are introduced.

Scanned/photographed agreements supplement the original stay_agreements record via
an append-only file association with an exact branch/stay/agreement foreign key.
The linked resident or staff with live stay_manage can attach only their own clean
correct-purpose private file. A scan is not proof of cryptographic signing or payment.
A file cannot be reassigned to another agreement. Existing evidence is never replaced.
Private downloads resolve the exact association or immutable template snapshot,
recheck live session and branch/self scope, apply existing sensitive-access policy,
audit in the same transaction and issue short-lived URLs from existing private storage.
Public marketplace endpoints do not expose these files or resident information.

Migration note: generated0068 adds private upload purposes and the supplemental file
association; custom-generated0069 reuses the existing immutable audit trigger against
UPDATE/DELETE/TRUNCATE. No destructive rewrite/backfill. Disposable tests only; local
development rollout requires the existing coordinated migration approval gate.
