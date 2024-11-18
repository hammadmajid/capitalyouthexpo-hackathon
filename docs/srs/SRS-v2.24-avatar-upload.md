# SRS v2.24 — inline avatar upload

AUTH-C / SEC-003. New avatars accept private JPEG, PNG or WebP files up to
5,000,000 bytes. Completion checks the uploaded byte count and detected media
type, then stores the validated bytes in an immutable private object and records
its digest. Avatar completion skips the antivirus queue. Other upload purposes
retain the existing scan workflow. Existing saved avatars remain readable.

## Migration note

No schema migration. Deploy the API and mobile validation together. Oversized
pending avatar uploads must be replaced with an image within the new limit.
