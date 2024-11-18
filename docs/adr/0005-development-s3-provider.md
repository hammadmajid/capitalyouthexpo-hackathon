# ADR 0005: Development S3 provider after MinIO pull failure

- **Status:** Accepted
- **Date:** 2026-10-07
- **Source:** User-authorized Phase 1A CI repair; SEC-003 private file access

## Context

Run 37609177330 could not pull the configured MinIO image. S3 compatibility and private
storage are required; MinIO is not. Current LocalStack distribution requires an account
token, and its free tier is restricted to non-commercial use; older community images no
longer receive ongoing maintenance. This conflicts with a maintained token-free development
dependency for this commercial marketplace.

Sources: [LocalStack delivery policy](https://blog.localstack.cloud/the-road-ahead-for-localstack/),
[Versity project and Apache licence](https://github.com/versity/versitygw).

## Decision

Use publicly pullable `versity/versitygw:v1.8.0` for local/CI S3, backed by a Compose volume.
Use `amazon/aws-cli:2.31.16` to initialize the private bucket automatically. Both release
manifests returned HTTP 200 from Docker Hub before configuration. Actual container success
requires GitHub Actions evidence.

Keep application configuration provider-neutral. Example credentials are development-only
fixtures. Verify signed HeadBucket/PutObject/GetObject/DeleteObject plus HTTP 403 for
anonymous bucket listing and existing-object download. No public ACL is enabled.

## Consequences

MinIO server/mc configuration, console port and root credential names are removed.
Production R2/Spaces selection is unchanged. SDK tests use normal S3 APIs; they do not mock
storage. Integration remains mandatory and is not counted as LOCAL PASS on this machine.
