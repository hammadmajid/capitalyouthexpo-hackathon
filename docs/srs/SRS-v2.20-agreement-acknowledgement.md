# SRS v2.20 — authenticated agreement acknowledgement

User-authorized property lifecycle master (STAY-002 / RES-005 / ACC-002).
A live authenticated account explicitly linked to a stay may acknowledge that stay's
exact original agreement version and canonical terms digest. Evidence records the
account, authenticated session identifier, server timestamp and original agreement.
It is an acknowledgement, not a cryptographic signature or an assertion of legal effect.
Owners/managers can view evidence only through existing authorized stay records and
cannot acknowledge on behalf of a resident. Prior agreement/financial snapshots remain
immutable; changed policies never overwrite accepted terms. Replays reauthorize access
and preserve the original evidence/timestamp. Different keys do not duplicate evidence.
Acknowledgement is not backdated and does not retrospectively change admission rules.

Migration0066 adds the evidence association to existing stay_agreements; migration0067
reuses the established immutable history trigger. These are additive, disposable-tested
changes; local development rollout remains pending the coordinated migration gate.
Agreement document/template management is separate remaining scope, not delivered by
this acknowledgement capability. Existing scanned/signed files are not relabeled.
