# SRS v2.41: Manual resident CNIC photo

CHG-060 / RES-001 / SEC-003 / STAY-001. User-directed 2026-11-21.

Add Resident places a clean camera action inside the right side of the existing
CNIC field. The number remains separately typed and validated; no OCR, guessed
identity, account matching or verified status is introduced. A photo is optional.
Choose JPEG/PNG through the private document picker, retaining safe compression,
scan gating, cancellation and contextual preview/replace/delete. Delete removes
only the unsaved form selection, never historical resident evidence.

An optional cnicPhotoFileId on the manual admission command belongs only to a
new branch-local resident. Existing-resident commands cannot overwrite evidence.
The authenticated admitting actor must own the private resident_document image
in the configured bucket, with a canonical object key, clean scan and valid
checksum. Deny foreign/public/wrong-purpose/PDF/unscanned references. The existing
branch stay/rent/finance grants, active session, transactional authority checks,
idempotency and admission concurrency rules remain unchanged.

Store the optional file reference atomically with the new admission and audit its
attachment. Failure rolls back resident/Stay/financial writes. Do not expose it in
public marketplace, resident lists, account avatars or ordinary admission outputs.
The number continues to be encrypted and masked under CHG-054. File access still
uses existing private-file permissions and expiring URLs; no public URL or new
cross-account read grant is introduced. Retain old files/history under existing
policy; no object deletion or automatic payment/identity verification.

Migration note: generated additive 0087 adds nullable residents.cnic_photo_file_id
with a foreign key to files, without backfill or cascade deletion. Existing rows
remain null. Input/client field is additive and optional; omission preserves all
legacy admission behavior. No price or payment lifecycle changes.

Focused contract/native/SDK and real PostgreSQL authorization/rollback checks are
required before local application. Final coordinated acceptance remains separate.
