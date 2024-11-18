# SRS v2.40: Consistent photo controls

User-directed 2026-11-21. CHG-059 / UI-001 / SEC-003 / AUTH-C / OWN-001.

Editable native photo pickers show a recognizable choose icon. Selected photos
expose a small top-right pencil with Replace and Delete. Preserve minimum touch
targets, accessible names, private signed previews, file scan gates and existing
branch/module permissions. Cancellation or rejected replacement preserves an
existing clean image. Gallery Delete uses the existing audited archive command;
mandatory room/bed photo rules still apply. Submitted financial evidence and
historical documents remain immutable through their existing lifecycle.

The verified authenticated Customer/Owner may unlink their own profile avatar
when saving their profile. Omitted profilePhotoFileId preserves the current
reference; explicit null clears it. A replacement UUID must still be owned and
scanned clean. Identity/name/CNIC restrictions, actor locking, existing profile
save audit and moderation/withdrawal capabilities are unchanged. No arbitrary
user target is accepted. Linked resident projections read the resulting current
profile image through the existing authorized relationship.

Migration note: no database migration or file deletion. users.profile_photo_file_id
already permits null. Extend the two strict self-profile input contracts/OpenAPI
and native clients to carry explicit null. Keep historical file/audit/review rows;
never delete the uploaded object through the picker. Existing positive-ID and
omitted-field clients remain compatible.

Numeric entry uses exact string grouping for amounts and quantities, e.g.
1234567.89 displays 1,234,567.89. Form state/API parsers retain ungrouped text and
integer-paisa money. Phone, CNIC, OTP, years and account/room/bed identifiers are
excluded. This is presentation-only and changes no price or payment obligation.

Focused regression checks precede delivery. Coordinated acceptance and deployment
remain separate.
