# Admin Phase 1/2 identity readiness (ADM-002, AUTH-C, CHG-006, SEC-003)

This is an operator runbook, not authorization to change a live account.
No phone number or password grants Root authority. No new SMS provider or phone-only recovery is introduced.

## Existing approved software pathway

1. The legitimate Root signs in using the existing verified email and permanent password.
   If needed, use the existing Login → Forgot password email/code flow; ownership of the mailbox is required.
   Lost-mailbox or disputed identity recovery requires separate explicit privileged approval and verified evidence.
   Ordinary Support may not reset Root authority. Do not rerun seed or provision a replacement Root.
2. From Admin profile, open Account security or Complete Customer profile.
   The existing Customer-profile endpoint operates on the authenticated userId, requires active account,
   verified email and permanent credentials, checks identity/gender correction policy, locks the actor,
   enforces phone uniqueness in PostgreSQL and writes a safe audit in the same transaction.
   It preserves password, Root membership, grants and session lineage.
3. Phone input is an unverified contact/login identifier under CHG-002/006.
   Email verification is NOT proof of phone ownership, and the UI says so.
   Do not set phoneVerifiedAt or represent a phone as verified through this flow.
4. Before using that self-service contact field for the intended privileged account assignment,
   an authorized operator must independently verify number ownership and that the authenticated Root
   is the intended person. Confirm uniqueness without disclosing other account identities.
   Record evidence/approval through the organization's approved restricted process; do not publish it.
   If this approval or identity match is unavailable, stop the live assignment and leave the account unchanged.
   No privileged phone-binding bypass endpoint or manual SQL write is supplied here.
5. Retain the current canonical display name unless an identity correction has separately been approved.
   Complete eligible adult Customer onboarding on that same identity. Never register a second identity.
6. After authorized completion, refresh me, confirm both capabilities on the same userId, then explicitly
   test phone + password login, Customer↔Admin switching, recovery, logout and role revocation.
   No Root grant follows from entering a phone; backend role lookup remains authoritative.

## Current operational status

The intended number is omitted from source and fixtures. No live phone assignment, password reset,
Customer-profile creation or Root membership change was performed by this implementation.
Read-only metadata must be reported separately from device/credential verification.
Ownership evidence and live assignment are pending operator action; phone login is NOT operationally certified.
Phone-based Admin invitations remain deferred here: unverified contact numbers are not trusted invitation ownership evidence.
Existing email invitation compatibility is retained.

## Migration

No schema migration or development-database provisioning is needed for native Phase 1/2 screens/pagination.
Current historical migrations, bootstrap and original Root transaction lock order remain unchanged.
