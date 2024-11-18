# ADR0089: shared mobile navigation and loading primitives

- Status: Implemented; broad physical-role acceptance remains bounded
- Date: 2026-10-31
- Requirements: ACC-001, SEC-003, HMA-017; user-directed app-wide UX

## Decision

Extend the existing Admin header into one app-wide AppHeader with a compatibility
export, contextual search configuration and shared icon controls. Preserve explicit
workflow close callbacks and focus-scoped hardware-back cleanup. Retain primary
Owner/auth designs. Loading primitives own animation only; existing readers retain
authorization, error/retry and private-data masking. Coordinate related aggregate
reads while independent discovery regions load separately.

## Consequences

No alternate header implementation or data-fetch architecture. Scoped APIs and
business commands remain authoritative. Date filters reuse existing analytics;
lifetime uses retained account history rather than an invented launch date. No
migration, permission expansion or new dependency.
