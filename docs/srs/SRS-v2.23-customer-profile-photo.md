# SRS v2.23 — direct Customer profile photo save

AUTH-C / HMA-015 / SEC-003. A photo selected in Customer Profile saves through
the existing authenticated Customer Profile endpoint after ownership, private
storage, avatar-purpose and clean-scan checks. This applies to multi-role
accounts using Customer Profile. The photo is stored on the shared identity.

The Owner Profile endpoint retains its moderation requirement when enabled.
Identity correction requirements, review history and authorized moderation of
current photos remain in effect.

## Migration note

No schema migration. Deploy the Customer Profile API and mobile UI together.
