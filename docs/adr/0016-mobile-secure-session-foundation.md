# ADR 0016: Native credentials and mobile verification

- Status: Accepted
- Date: 2026-10-09
- Requirements: AUTH-C-001..004, SEC-001, ACC-002, CHG-005

## Context

Phase 1 requires a real Expo client and capability-aware foundation. Windows has
no container runtime. Client state cannot grant backend authorization.

## Decision

Use Expo SDK 57, Router and NativeWind 4, with the shared contracts, generated
bearer API client and HSM tokens. Validate the public API root and environment;
staging/production require HTTPS. No secret configuration enters the bundle.

Keep one strict versioned access/refresh/session envelope in Expo SecureStore,
using device-only unlocked Keychain access and Android backup exclusion. Do not
persist identity, capabilities or business records. Storage errors fail closed.
Restore by fetching the live profile; rotate eligible expired sessions in one
serialized queue. Logout shares that queue, restores expired credentials before
server revocation, and removes local credentials even when the request fails.
Local cleanup never means successful server revocation. Terminal rejection clears
stored credentials; transient network errors grant no access.
Keep authentication in volatile state, separate from private query caches. Clear
private data on logout or rejection and ignore late restore responses. Failed
secure deletion blocks restoration until cleanup succeeds; failed server logout
shows a truthful global notice after local cleanup.

Router guards and presentation contexts improve navigation only. Backend grants
remain authoritative. Resident context is denied until active-stay authorization
arrives in its scheduled phase. Both clients support simultaneous capabilities.

Vitest verifies pure policies and typed HTTP transport behavior. Expo's supported
Jest preset plus React Native Testing Library verifies native components; native
module substitutes in these component tests do not satisfy integration gates.
Maestro must verify an installed Android app against the actual API, worker and
Testcontainers infrastructure on a compatible CI runner. Existing API integrations
remain mandatory. Metro export, native APK build and device smoke results must be
reported independently; none is interchangeable with another.

## Consequences

Secure storage can fail and iOS Keychain data can survive reinstallation. Each
startup therefore revalidates server capabilities and revocation before access.
Android device testing adds a required emulator/SDK job. CI evidence, rather than
local Docker availability, determines infrastructure completion.
