# ADR 0067: Source-validated chat events and immediate authority revocation

- **Status:** Accepted within the Phase 3 implementation directive
- **Date:** 2026-10-24
- **Source:** COMM-001/002, MGR-004, SEC-003, AUD-002; ADR0001; API10

## Decision

Persist chat messages and required lifecycle outbox events transactionally.
The existing notification worker produces deduplicated recipient notices and a
source-bound internal realtime job. Redis pub/sub distributes only persisted
message IDs and timestamps to each API replica. Each replica validates source,
live session and exact participant scope before emitting a Socket.IO invalidation.
Clients refetch authorized REST history on delivery and reconnect.

This implements ADR0001's Socket.IO/Redis technology choice without a room
adapter broadcasting directly to cached members. Per-recipient reauthorization
must occur before disclosure; room membership alone cannot establish authority.
Browser polling uses the existing same-origin proxy and HttpOnly cookies; native
WebSocket credentials are bound to the current account before connection.

Additive migration0045 emits PostgreSQL notifications after committed account,
session, Manager-assignment or hierarchy changes. A dedicated, single-connection
Drizzle listener on each API replica disconnects the affected user/session sockets;
hierarchy changes conservatively disconnect staff selections for reauthorization.
Notification payloads carry only scope identifiers. Transaction rollback emits no
revocation event. Existing REST checks and before-emit authorization remain.

Listener loss immediately disconnects sockets and closes the handshake gate until
LISTEN is reestablished. Reconnect uses a bounded retry timer. This covers missed
ephemeral authority events by requiring fresh authentication after listener loss.
The existing five-second session/scope probe remains a fallback and detects token
expiry; it is not the primary path for persisted revocation.

## Consequences

Redis outages may delay or duplicate invalidations; database messages remain
authoritative and clients reconcile history. No message text, file URL or contact
detail enters either notification channel. Each API replica needs one additional
direct PostgreSQL connection supporting LISTEN. Transaction-pooling proxies must
provide a direct/session-bound connection for this listener.

No authorization, retention, pricing or state-machine policy changes. Ordinary
admins remain excluded from participant APIs. Reported-case access is a separate,
justified, bounded and transactionally audited read.
