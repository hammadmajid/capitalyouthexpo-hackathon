# Verified temporary Expo dependency backports

Date: 2026-10-09. Requirement: SEC-001. Decision: [ADR 0017](adr/0017-temporary-dependency-backports.md).

The user delegated the interim decision with "do best possible by yourself".
Only the two exact advisory/version/Expo dependency paths below are accepted,
conditional on installed-source and patch SHA-256 checks, exploit regressions and
expiry at **2026-11-08 00:00 UTC**. A published fixed version, scope drift, integrity
failure, scanner failure or any other high/critical finding fails CI. Existing
integration assertions and coverage gates remain mandatory.

LOCAL PASS: 51 configuration/security tests; integrity and audit policy have 100%
line/branch/function/statement coverage. The real registry scan is **PASS WITH
VERIFIED TEMPORARY BACKPORT EXCEPTIONS**, not a clean audit. Raw pnpm reports still
contain two high and four moderate findings. This checkpoint's CI is pending.

Forge's nested DigestAlgorithm check follows upstream PR 1152 at
`ceba34402e329f0365134f23fe19898756527d65`; the maintained patch additionally rejects
nonempty NULL parameters. Regressions use generated low-exponent RSA keys,
malformed signed encodings and a valid native RSA/SHA256 signature. Braces limits
parse/walk/expansion/flatten nesting to 128 levels. Tests cover under-length-limit
patterns, direct deep AST/queue inputs and normal Metro globs. Pristine braces
accepts the corrected 8,003-character fixture without a guard; patched copies
reject it. These fixes address the specific vulnerabilities tested.

`pnpm turbo run security:audit --filter=@hsm/config` runs the canaries, verifies
`patches/backports.json` against actual Expo dependency copies, then invokes
`pnpm audit --prod --audit-level high --json`. Full audit and decision reports are
CI artifacts. Replace backports with compatible published fixes, rerun equivalent
regressions and remove exceptions.

## Historical blocker and review proposal (superseded)

This records the state before the delegated decision and implementation.

### Original Task 12 dependency audit blocker

Date: 2026-10-09. Requirement: SEC-001.

The Expo mobile checkpoint passes its focused policy/component tests, but the
unchanged `pnpm audit --prod --audit-level high` command fails. This is a security
failure, not CI PASS. Four moderate findings also remain in the report.

| Dependency path                                                    | Installed version | Advisory                                                                 | Published fixed version   |
| ------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------ | ------------------------- |
| mobile → expo → @expo/cli → node-forge                             | 1.4.0             | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | None at verification time |
| mobile → expo → @expo/metro → metro-file-map → micromatch → braces | 3.0.3             | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | None at verification time |

Registry metadata confirmed these installed versions are the latest published
versions. Both upstream advisories report no patched release. The forge advisory
links a proposed upstream fix, [PR 1152](https://github.com/digitalbazaar/forge/pull/1152);
its existence is not evidence of a released or verified remediation.

The dependency paths involve build/development tooling. That observation does not
clear the repository's existing audit gate. No advisory ignores, severity changes,
`continue-on-error`, false version bumps or production/development reclassification
have been applied to make the audit green. Existing integration tests remain
mandatory and unchanged.

Phase 1 cannot be declared complete while this required gate fails. A compatible
verified dependency remediation, or an explicit reviewed project decision about
these findings, is needed before claiming successful security verification.

### Original review proposal

If the project explicitly accepts an interim remediation, its scope would be:

- Only GHSA-86w9-cpqp-85rv and GHSA-vfj7-8cjw-p6xm on the Expo tooling paths above.
- Require reviewed, pinned backports with exploit regressions and patch-integrity
  checks before any exception can take effect. A patch installation failure fails CI.
- Preserve the full raw audit report. Every other high/critical finding fails CI.
- Expire on 2026-11-08; expiry fails CI. Replace backports with verified published
  fixes as soon as compatible releases exist.
- Report accepted exceptions explicitly, separately from unqualified security PASS.
- Never change integration assertions, coverage thresholds or authorization logic.

This proposal needs an explicit project decision. No implementation, suppression
or acceptance has occurred. Keeping the existing gate blocked remains the default.
