# ADR 0091: Versioned templates and original-stay scanned documents

- Status: Accepted
- Date: 2026-11-02
- Decision owner: User property lifecycle master

## Decision

Reuse billingPolicies.policy and immutable stayAgreements.termsSnapshot for optional
agreement text/template versions. Reuse files, private storage, scanning and existing
command idempotency; introduce only a supplemental append-only agreementFiles
association, not another agreement/resident model. Distinct private upload purposes
prevent identity evidence from being silently reused as agreement templates/scans.

A dedicated exact-stay file broker resolves the association, session/self or existing
branch stay_manage grant, existing operational sensitive-access policy and audit
before signing a short-lived private URL. Generic own-file access is not broadened.
Owner template commands compare the current effective policy ID under existing scope
locks and preserve financial fields; financial form round trips retain the metadata.

## Consequences

Old agreement versions, acknowledged digests, invoices and scans are retained. No
ordinary scan or authenticated acknowledgement is called a cryptographic signature.
Migrations0068/69 remain local-development gated after disposable validation. Android
acceptance remains separate from source/unit/integration verification.

## Related operational reads (CHG-026)

The exact-stay approved resident-photo broker follows the same existing private
storage, live scope and sensitive-audit boundary; it never broadens generic file
ownership. Shared stay invalidation keys and one Pakistan-day timer refresh actual
server facts without a polling loop. Historical financial statements are retained;
new optional read summaries do not alter posting/checkout arithmetic.
