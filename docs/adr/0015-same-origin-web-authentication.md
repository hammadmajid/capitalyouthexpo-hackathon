# ADR 0015: Same-origin web authentication

- Status: Accepted
- Date: 2026-10-09
- Requirements: SEC-001, SEC-003, AUTH-C, CHG-005

## Context

Web authentication uses HttpOnly access/refresh cookies and a readable,
refresh-bound CSRF cookie. A browser on a separate frontend origin cannot read
the API origin's CSRF cookie. Both clients must support all future capabilities.

## Decision

Use a same-origin Next.js route handler at /api/v1 to forward to the validated,
server-only API_ORIGIN. Require the configured WEB_ORIGIN for mutations. Bound
JSON bodies to 1 MiB, reject path overrides, forbid redirects, forward only
selected headers and preserve backend Set-Cookie. Never forward a browser bearer
header through this cookie-only transport. Deployed origins require HTTPS.

Only confirmed SESSION_REVOKED responses expire browser transport cookies.
Expired access preserves refresh credentials. Restore through the actual /v1/me
contract, refresh once when eligible, then reload live capabilities. Keep
identity/capability data in memory, and clear it on logout or terminal rejection.
Passwords, OTPs and CNIC never enter URLs or query mutation caches.

Use the fixed shared visual tokens, self-hosted Plus Jakarta Sans, Lucide,
Tailwind, shadcn-style Radix primitives, React Hook Form and TanStack Query.
Nonce-based CSP protects scripts; framework rendering remains dynamic.
Guest routing uses cookie presence only as a restoration hint, never a grant.
Deployed responses include HSTS. Cross-tab refresh takes an origin-scoped Web
Lock, then reloads the live profile before deciding whether rotation is still
necessary. Browsers without Web Locks can sign in and use valid sessions, but
must sign in again after access expiry rather than risk concurrent refresh reuse.

The shell supports Customer, Resident, Owner, Manager and Admin contexts.
Backend capabilities control entry. Resident entry remains denied until the
scheduled active-stay domain supplies authorization. No Phase 2 screens or data
are fabricated. Real branch lookups use the implemented minimal management API.

## Consequences

The API remains the authorization authority. Frontend routing is an additional
usability boundary. Unit transport tests cannot establish real infrastructure or
browser correctness. Task 11 needs a successful production build and real
Playwright/API/container verification before completion.
