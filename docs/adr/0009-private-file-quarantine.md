# ADR 0009: Private file quarantine and immutable verified snapshots

- **Status:** Accepted
- **Date:** 2026-10-08
- **Related:** SEC-003, ADR 0005, Phase 1 Task 9

## Context

A signed upload URL remains usable until expiry. Publishing the uploaded key after
scanning would let a client replace already scanned content. MIME declarations and
extensions cannot establish the contents of an object.

## Decision

The shared files package defines provider ports, strict upload metadata, bounded
content validation, S3-compatible private storage and a ClamAV streaming adapter.
Uploads target opaque quarantine keys and expire after five minutes.
Server-generated receipts and exports cannot use client upload purposes.

Read at most the declared policy limit, verify the actual length and detected MIME,
compute SHA-256 on the server and scan those exact bytes. A clean result is copied
from that in-memory snapshot to a new private key with a unique attempt nonce.
Client upload credentials never authorize a write to a verified key.
Download URLs last sixty seconds and force attachment disposition.

Only an explicit clean scanner verdict succeeds. Connection errors, timeout,
malformed responses and exceeded limits fail closed. ClamAV TCP is restricted to
the private service network; it provides no client authentication.
Production signature updates remain enabled. CI uses the full versioned image
with bundled signatures and disables network updates for reproducibility.

## Consequences

The adapter alone does not establish actor authorization or a completed file
workflow. API completion must persist pending work through the existing outbox;
worker publication must require a current unexpired delivery lease. Downloads
must check live actor/resource permission, clean state and audit before signing.
These integrations remain separate unfinished Task 9 work.

Mandatory Testcontainers tests use actual Versity and ClamAV, including the
standard benign antivirus test signature. No container checks run on local
Windows without a compatible runtime. The common command is
`pnpm turbo run test:integration`; CI must succeed before claiming verification.

Provider documentation: [AWS presigning](https://aws.amazon.com/blogs/developer/generate-presigned-url-modular-aws-sdk-javascript/),
[ClamAV Docker](https://docs.clamav.net/manual/Installing/Docker.html),
[streaming protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html).
