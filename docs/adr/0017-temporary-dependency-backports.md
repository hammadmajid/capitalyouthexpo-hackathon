# ADR 0017: Verified temporary dependency backports

- Status: Accepted
- Date: 2026-10-09
- Requirement: SEC-001

## Context

Expo tooling includes node-forge 1.4.0 and braces 3.0.3 with high advisories and no
published fixed releases at verification. The original production audit failed.
The user delegated the concrete proposal with "do best possible by yourself".

## Decision

Maintain pinned pnpm patches for GHSA-86w9-cpqp-85rv and GHSA-vfj7-8cjw-p6xm.
Apply exact advisory/version/Expo-path exceptions only after exploit regressions
and SHA-256 checks of committed patches and installed sources pass. Use the real
registry audit and retain its full report. Fail closed on any other high/critical
finding, published fix, scope drift, scanner failure, changed patch/source or
expiry on 2026-11-08 at 00:00 UTC. Canonical LF handles Windows checkout line
endings without ignoring content changes.

Forge follows the upstream nested DigestAlgorithm check and additionally requires
empty NULL parameters. Braces bounds parse and recursive AST/queue operations to
128 levels while preserving ordinary Metro globs. Tests exercise actual Expo
dependency copies, malformed/valid signatures, strings, direct ASTs and queues.
Keep authorization, integration and coverage gates blocking. Report explicit
temporary exceptions rather than a clean audit.

## Consequences

Local and CI use the same Turbo security task. Expiry intentionally stops builds.
Maintainers must install compatible published fixes, rerun regressions and remove
patches/exceptions. Full audit artifacts retain moderate findings without hiding
or reclassifying severity. See [the audit record](../mobile-dependency-audit.md).
