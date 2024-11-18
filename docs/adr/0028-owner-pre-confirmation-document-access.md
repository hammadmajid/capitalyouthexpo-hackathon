# ADR 0028: Owner-only pre-confirmation booking-document access

- Status: Accepted
- Date: 2026-10-14
- Refs: SEC-003, BKG-001..009, ACC-002/003/006, CHG-008

## Context

Phase 2 evidence review needs access before confirmation. Existing sensitive
access requires approval; the user explicitly selected Owner-only access and
Manager status-only visibility.

## Decision

Apply SRS v2.3's narrow exception to private booking documents. Resolve owning
Owner and evidence scope server-side, require live authorization and clean private
files, and audit access/review. Manager grants cannot bypass this prerequisite.
Keep separate stored CNIC/address/chat resource policies and post-approval
policies unchanged. Submitted document contents can contain printed identity
details; Customer sharing UI must make Owner access clear.

## Consequences

Add authorization-matrix regression tests and real database/HTTP coverage.
Evidence lifecycle migrations remain additive. The earlier privacy blocker is
resolved; implementation and verification are still in progress.
