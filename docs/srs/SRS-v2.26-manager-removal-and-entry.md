# SRS v2.26 — Manager removal confirmation and sign-in priority

AUTH-M-006 / MGR-004 / ACC-006. Product decision (2026-11-14).

- Removing a Manager, or cancelling a pending invitation, ends the assignment and requires the
  acting Owner's own current password. The server verifies it (argon2id) before the audited
  transition; a wrong or missing password changes nothing and returns `400 VALIDATION_FAILED`
  (not 401, so the Owner's session is not ended). The mobile Team list shows Remove for active
  Managers and Cancel invitation for pending ones.
- After first activation (Activate manager account), a Manager signs in from the normal login
  screen with mobile number and password. An account that is both Manager and Customer opens
  the Manager workspace first and can switch to Customer from Manager Account. Admin access
  and an Owner's last chosen Owner mode keep their existing priority.
- A Manager's first open completes the Customer profile fields (after verifying an email when
  the account has none); Back on that step signs out to login.

## Migration note

No schema migration. The deactivate request body changes from `{}` to `{ currentPassword }`;
deploy the API and clients together.
