# SRS v2.3 supplement: Pre-confirmation booking-document review

Approved by the user on 2026-10-14. Refs: SEC-003, BKG-001..009,
ACC-002/003/006, CHG-008. This supplement changes only pre-confirmation
access to customer-submitted private booking documents.

The owning hostel Owner may view these documents for booking verification.
Managers may see verification status only before confirmation, including Managers
with a document-review grant. The server must resolve ownership, branch, customer,
file purpose, scan readiness and live actor/session authorization; client claims
cannot authorize access. Reads and review decisions require transactional audit.
Public marketplace responses must never include document references or contents.

Owner review exposes the submitted document's contents, which may include CNIC
or address information printed on it. Customer sharing UI must describe that
Owner-only disclosure accurately. The exception does not expose the separate
stored CNIC/address profile fields, private-chat resources, another hostel's
evidence or unrelated files before confirmation.
Existing own-customer, post-approval/walk-in and justified Root safety-case access
rules remain in force. CHG-007 still permits Owner-configurable optional CNIC.

Migration note: use additive migrations for evidence lifecycle metadata and guards;
retain prior migrations and historical evidence. No broad role-grant backfill or
public bucket conversion is authorized. Container verification remains required.
